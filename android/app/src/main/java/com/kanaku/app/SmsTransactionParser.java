package com.kanaku.app;

import org.json.JSONException;
import org.json.JSONObject;

import java.security.MessageDigest;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class SmsTransactionParser {
    private static final List<String> BANK_KEYWORDS = Arrays.asList(
        "HDFC", "ICICI", "SBI", "AXIS", "KOTAK", "YESBANK", "IDFC", "HSBC",
        "CHASE", "CITI", "AMEX", "BOB", "CANARA", "PNB", "FEDERAL", "PAYTM",
        "PHONEPE", "GPAY", "GOOGLEPAY", "AMAZONPAY", "UPI"
    );

    private static final Pattern MASKED_ACCOUNT_PATTERN = Pattern.compile(
        "(?i)(?:a/c|acct|account|card)\\s*(?:no\\.?|number)?\\s*[:\\-]?\\s*([xX*]{0,8}\\d{3,8})"
    );
    private static final Pattern BALANCE_PATTERN = Pattern.compile(
        "(?i)(?:available\\s+balance|avl\\s+bal|balance|bal)\\D{0,10}(?:rs\\.?|inr|₹)?\\s*([0-9,]+(?:\\.\\d{1,2})?)"
    );
    private static final Pattern DATE_TEXT_PATTERN = Pattern.compile(
        "(?i)(?:on|dt|dated)?\\s*(\\d{1,2}\\s+[a-z]{3,9}(?:\\s+\\d{2,4})?)"
    );
    private static final Pattern DATE_NUMERIC_PATTERN = Pattern.compile(
        "(?i)(?:on|dt|dated)?\\s*(\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?)"
    );

    private SmsTransactionParser() {}

    public static JSONObject parse(String sourceSmsId, String originAddress, String body, long timestampMillis) {
        if (body == null || body.trim().isEmpty()) {
            return null;
        }

        String compactBody = body.trim().replaceAll("\\s+", " ");
        String lowered = compactBody.toLowerCase(Locale.ENGLISH);

        if (isIgnoredMessage(lowered) || !looksTransactional(lowered)) {
            return null;
        }

        Double amount = extractAmount(compactBody);
        if (amount == null || amount <= 0) {
            return null;
        }

        String transactionType = detectTransactionType(lowered);
        if (transactionType == null) {
            return null;
        }

        try {
            JSONObject result = new JSONObject();
            result.put("sourceSmsId", sourceSmsId == null || sourceSmsId.isEmpty()
                ? buildSyntheticSourceId(originAddress, compactBody, timestampMillis)
                : sourceSmsId);
            result.put("amount", amount);
            result.put("transactionType", transactionType);
            result.put("merchant", extractMerchant(compactBody, transactionType));
            result.put("bankName", extractBankName(originAddress, compactBody));
            result.put("accountLast4", extractAccountLast4(compactBody));
            result.put("currencyCode", extractCurrencyCode(compactBody));
            result.put("dateIso", extractDate(compactBody, timestampMillis));
            if (extractBalance(compactBody) != null) {
                result.put("balance", extractBalance(compactBody));
            }
            result.put("sourceAddress", originAddress == null ? "" : originAddress);
            result.put("sourceChannel", extractChannel(lowered));
            result.put("messagePreview", compactBody.length() > 180 ? compactBody.substring(0, 180) + "..." : compactBody);
            result.put("confidenceScore", calculateConfidence(lowered, compactBody, amount));
            return result;
        } catch (JSONException exception) {
            return null;
        }
    }

    private static boolean isIgnoredMessage(String lowered) {
        return lowered.contains("otp")
            || lowered.contains("one time password")
            || lowered.contains("verification code")
            || lowered.contains("do not share")
            || lowered.contains("promo")
            || lowered.contains("discount")
            || lowered.contains("offer")
            || lowered.contains("sale ends")
            || lowered.contains("delivered")
            || lowered.contains("out for delivery")
            || lowered.contains("shipment")
            || lowered.contains("tracking")
            || lowered.contains("subscribe")
            || lowered.contains("unsubscribe")
            || lowered.contains("click link")
            || lowered.contains("http://")
            || lowered.contains("https://")
            || lowered.contains("lottery")
            || lowered.contains("win cash");
    }

    private static boolean looksTransactional(String lowered) {
        boolean hasKeyword = lowered.contains("debited")
            || lowered.contains("credited")
            || lowered.contains("spent")
            || lowered.contains("received")
            || lowered.contains("paid")
            || lowered.contains("withdrawn")
            || lowered.contains("deposit")
            || lowered.contains("purchase");
        boolean hasSourceHint = lowered.contains("a/c")
            || lowered.contains("account")
            || lowered.contains("upi")
            || lowered.contains("imps")
            || lowered.contains("neft")
            || lowered.contains("card")
            || lowered.contains("wallet")
            || lowered.contains("bank");
        boolean hasAmountHint = lowered.contains("rs")
            || lowered.contains("inr")
            || lowered.contains("₹")
            || lowered.matches(".*\\d{2,}\\.\\d{1,2}.*");

        return hasKeyword && hasSourceHint && hasAmountHint;
    }

    private static Double extractAmount(String body) {
        String[] patterns = new String[] {
            "(?i)(?:rs\\.?|inr|₹)\\s*([0-9,]+(?:\\.\\d{1,2})?)\\s+(?:has\\s+been\\s+)?(?:debited|credited|spent|received|paid|withdrawn)",
            "(?i)(?:debited|credited|spent|received|paid|withdrawn)\\D{0,18}(?:rs\\.?|inr|₹)\\s*([0-9,]+(?:\\.\\d{1,2})?)",
            "(?i)(?:amt|amount)\\D{0,8}(?:rs\\.?|inr|₹)\\s*([0-9,]+(?:\\.\\d{1,2})?)",
            "(?i)(?:rs\\.?|inr|₹)\\s*([0-9,]+(?:\\.\\d{1,2})?)"
        };

        for (String expression : patterns) {
            Matcher matcher = Pattern.compile(expression).matcher(body);
            if (matcher.find()) {
                return parseAmount(matcher.group(1));
            }
        }

        return null;
    }

    private static Double extractBalance(String body) {
        Matcher matcher = BALANCE_PATTERN.matcher(body);
        if (!matcher.find()) {
            return null;
        }
        return parseAmount(matcher.group(1));
    }

    private static Double parseAmount(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            return null;
        }

        try {
            return Double.parseDouble(raw.replace(",", "").trim());
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private static String detectTransactionType(String lowered) {
        if (lowered.contains("credited")
            || lowered.contains("received")
            || lowered.contains("deposited")
            || lowered.contains("salary")) {
            return "income";
        }

        if (lowered.contains("debited")
            || lowered.contains("spent")
            || lowered.contains("paid")
            || lowered.contains("withdrawn")
            || lowered.contains("purchase")) {
            return "expense";
        }

        return null;
    }

    private static String extractMerchant(String body, String transactionType) {
        String[] patterns = transactionType.equals("income")
            ? new String[] {
                "(?i)from\\s+([A-Za-z0-9&.,'\\- ]{2,40}?)(?=\\s+(?:on|ref|utr|txn|txnid|avl|available|balance|via|$)|[.,])",
                "(?i)by\\s+([A-Za-z0-9&.,'\\- ]{2,40}?)(?=\\s+(?:on|ref|utr|txn|avl|available|balance|via|$)|[.,])"
            }
            : new String[] {
                "(?i)(?:via\\s+(?:upi|imps|neft)\\s+to|to)\\s+([A-Za-z0-9&.,'\\- ]{2,40}?)(?=\\s+(?:on|ref|utr|txn|txnid|avl|available|balance|from|via|$)|[.,])",
                "(?i)at\\s+([A-Za-z0-9&.,'\\- ]{2,40}?)(?=\\s+(?:on|ref|utr|txn|txnid|avl|available|balance|from|via|$)|[.,])"
            };

        for (String expression : patterns) {
            Matcher matcher = Pattern.compile(expression).matcher(body);
            if (matcher.find()) {
                String entity = sanitizeEntity(matcher.group(1));
                if (!entity.isEmpty()) {
                    return entity;
                }
            }
        }

        return "";
    }

    private static String sanitizeEntity(String raw) {
        if (raw == null) {
            return "";
        }

        String cleaned = raw
            .replaceAll("(?i)\\b(?:a/c|acct|account|card|upi|neft|imps)\\b", "")
            .replaceAll("[\\s.\\-,:]+$", "")
            .trim();

        if (cleaned.length() < 2) {
            return "";
        }

        return cleaned;
    }

    private static String extractBankName(String originAddress, String body) {
        String sender = originAddress == null ? "" : originAddress.toUpperCase(Locale.ENGLISH).replaceAll("[^A-Z0-9]", "");
        String upperBody = body.toUpperCase(Locale.ENGLISH);

        for (String keyword : BANK_KEYWORDS) {
            if (!sender.isEmpty() && sender.contains(keyword)) {
                return keyword.equals("GOOGLEPAY") ? "Google Pay" : normalizeBankLabel(keyword);
            }

            if (upperBody.contains(keyword)) {
                return keyword.equals("GOOGLEPAY") ? "Google Pay" : normalizeBankLabel(keyword);
            }
        }

        return "";
    }

    private static String normalizeBankLabel(String keyword) {
        if ("GPAY".equals(keyword)) return "Google Pay";
        if ("AMAZONPAY".equals(keyword)) return "Amazon Pay";
        if ("PHONEPE".equals(keyword)) return "PhonePe";
        if ("PAYTM".equals(keyword)) return "Paytm";
        return keyword;
    }

    private static String extractAccountLast4(String body) {
        Matcher matcher = MASKED_ACCOUNT_PATTERN.matcher(body);
        if (!matcher.find()) {
            return "";
        }

        return matcher.group(1).trim();
    }

    private static String extractCurrencyCode(String body) {
        String upper = body.toUpperCase(Locale.ENGLISH);
        if (upper.contains("USD") || upper.contains("$")) return "USD";
        if (upper.contains("EUR") || upper.contains("")) return "EUR";
        if (upper.contains("GBP") || upper.contains("£")) return "GBP";
        if (upper.contains("AED")) return "AED";
        return "INR";
    }

    private static String extractChannel(String lowered) {
        if (lowered.contains("upi")) return "UPI";
        if (lowered.contains("imps")) return "IMPS";
        if (lowered.contains("neft")) return "NEFT";
        if (lowered.contains("credit card")) return "Credit Card";
        if (lowered.contains("debit card")) return "Debit Card";
        if (lowered.contains("card")) return "Card";
        if (lowered.contains("wallet")) return "Wallet";
        if (lowered.contains("atm")) return "ATM";
        return "Bank SMS";
    }

    private static String extractDate(String body, long timestampMillis) {
        Date fallback = new Date(timestampMillis);
        String numericDate = matchDatePattern(DATE_NUMERIC_PATTERN, body);
        if (!numericDate.isEmpty()) {
            Date parsed = parseDateCandidate(numericDate, fallback);
            if (parsed != null) {
                return toIso(parsed);
            }
        }

        String textDate = matchDatePattern(DATE_TEXT_PATTERN, body);
        if (!textDate.isEmpty()) {
            Date parsed = parseDateCandidate(textDate, fallback);
            if (parsed != null) {
                return toIso(parsed);
            }
        }

        return toIso(fallback);
    }

    private static String matchDatePattern(Pattern pattern, String body) {
        Matcher matcher = pattern.matcher(body);
        while (matcher.find()) {
            String candidate = matcher.group(1);
            if (candidate != null && candidate.trim().length() >= 5) {
                return candidate.trim();
            }
        }
        return "";
    }

    private static Date parseDateCandidate(String candidate, Date fallback) {
        List<String> formats = Arrays.asList(
            "dd/MM/yyyy", "dd-MM-yyyy", "dd/MM/yy", "dd-MM-yy",
            "dd MMM yyyy", "dd MMM yy", "dd MMM", "dd MMMM yyyy", "dd MMMM"
        );

        for (String format : formats) {
            try {
                SimpleDateFormat parser = new SimpleDateFormat(format, Locale.ENGLISH);
                parser.setLenient(false);
                Date parsed = parser.parse(candidate);
                if (parsed == null) {
                    continue;
                }

                Calendar parsedCalendar = Calendar.getInstance();
                parsedCalendar.setTime(parsed);
                if (!format.contains("y")) {
                    Calendar fallbackCalendar = Calendar.getInstance();
                    fallbackCalendar.setTime(fallback);
                    parsedCalendar.set(Calendar.YEAR, fallbackCalendar.get(Calendar.YEAR));
                }

                return parsedCalendar.getTime();
            } catch (ParseException ignored) {
                // Try the next format.
            }
        }

        return null;
    }

    private static String toIso(Date date) {
        return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.ENGLISH).format(date);
    }

    private static double calculateConfidence(String lowered, String body, Double amount) {
        double confidence = 0.55d;
        if (amount != null && amount > 0) confidence += 0.15d;
        if (lowered.contains("debited") || lowered.contains("credited")) confidence += 0.10d;
        if (!extractBankName("", body).isEmpty()) confidence += 0.07d;
        if (!extractAccountLast4(body).isEmpty()) confidence += 0.05d;
        if (!extractMerchant(body, detectTransactionType(lowered)).isEmpty()) confidence += 0.08d;
        return Math.min(confidence, 0.98d);
    }

    private static String buildSyntheticSourceId(String originAddress, String body, long timestampMillis) {
        String seed = (originAddress == null ? "" : originAddress) + "|" + timestampMillis + "|" + body;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(seed.getBytes());
            StringBuilder builder = new StringBuilder("sms_");
            for (int index = 0; index < Math.min(hash.length, 8); index++) {
                builder.append(String.format(Locale.ENGLISH, "%02x", hash[index]));
            }
            return builder.toString();
        } catch (Exception exception) {
            return "sms_" + Math.abs(seed.hashCode());
        }
    }
}
