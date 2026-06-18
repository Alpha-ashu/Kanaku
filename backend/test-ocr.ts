import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import { scanReceiptWithGemini } from './src/features/ai/ocr.engine';
import { processImage } from './src/utils/imageProcessing';

async function testOCR() {
  try {
    const homedir = require('os').homedir();
    const imagePath = path.join(homedir, 'Downloads', 'the-bill.jpg');
    console.log('Reading image:', imagePath);
    
    const buffer = fs.readFileSync(imagePath);
    console.log('Processing image with sharp...');
    const processed = await processImage(buffer);
    
    console.log('Sending to Hybrid OCR (Tesseract + Gemini)...');
    const result = await scanReceiptWithGemini(processed.buffer, processed.contentType);
    
    console.log('OCR RESULT:\n', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('OCR test failed:\n', error);
  }
}

testOCR();
