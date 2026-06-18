const parseDate = (value) => {
  if (!value) return null;
  const trimmed = value.trim();

  const specificFormats = [
    /^\d{2}[A-Za-z]{3}\d{4}$/, // 15Feb2024
    /^\d{2}-\d{2}-\d{4}$/, // 15-02-2024
    /^\d{2}\/\d{2}\/\d{4}$/, // 15/02/2024
    /^\d{4}-\d{2}-\d{2}$/, // 2024-02-15
  ];

  if (specificFormats.some((regex) => regex.test(trimmed))) {
     // simplified for test
  }
  const relaxed = new Date(trimmed);
  return Number.isNaN(relaxed.getTime()) ? null : relaxed;
};

console.log("02/05/24 ->", parseDate("02/05/24"));
console.log("02-05-24 ->", parseDate("02-05-24"));
console.log("02-May-24 ->", parseDate("02-May-24"));
