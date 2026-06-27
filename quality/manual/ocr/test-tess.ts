import Tesseract from 'tesseract.js';
import fs from 'fs';

async function test() {
  try {
    // just test tesseract initialization
    console.log("Starting tesseract...");
    const result = await Tesseract.recognize(
      'https://tesseract.projectnaptha.com/img/eng_bw.png',
      'eng',
      { logger: m => console.log(m) }
    );
    console.log("Extracted text:", result.data.text);
  } catch (e) {
    console.error("Failed:", e);
  }
}
test();
