import React, { useState, useEffect } from 'react';
import { Camera, Mic, Upload, X, Check, AlertCircle, Zap, Brain } from 'lucide-react';
import { motion } from 'motion/react';
import { ocrEngine, ExpenseData } from '@/services/tesseractOCRService';
import { createVoiceAIProcessor, VoiceExpenseResult } from '@/services/voiceAIProcessor';
import { KANAKUAI } from '@/services/KANKUIntelligenceEngine';
import { useAICapability } from '@/contexts/AppContext';

// AUTO-FILL EXPENSE FORM LOGIC
// This component provides instant UX with AI-powered form filling

interface AutoFillExpenseFormProps {
 onExpenseData: (data: {
 amount: number;
 category: string;
 description: string;
 merchant?: string;
 date?: string;
 }) => void;
 onClose: () => void;
 userId: string;
}

export const AutoFillExpenseForm: React.FC<AutoFillExpenseFormProps> = ({
 onExpenseData,
 onClose,
 userId,
}) => {
 const [activeTab, setActiveTab] = useState<'camera' | 'voice' | 'upload'>('camera');
 const [isProcessing, setIsProcessing] = useState(false);
 const [extractedData, setExtractedData] = useState<ExpenseData | VoiceExpenseResult | null>(null);
 const [confidence, setConfidence] = useState(0);
 const [error, setError] = useState<string | null>(null);
 const voiceEnabled = useAICapability('voiceAssistant');

 // Initialize voice processor
 const [voiceProcessor] = useState(() => createVoiceAIProcessor(userId));

 useEffect(() => {
   if (!voiceEnabled && activeTab === 'voice') {
     setActiveTab('camera');
   }
 }, [voiceEnabled, activeTab]);

 const isVoiceExpenseResult = (
 data: ExpenseData | VoiceExpenseResult,
 ): data is VoiceExpenseResult => 'description' in data;

 useEffect(() => {
 return () => {
 // Cleanup
 voiceProcessor?.stopListening();
 };
 }, [voiceProcessor]);

 // CAMERA/OCR PROCESSING
 const handleImageCapture = async (imageFile: File) => {
 setIsProcessing(true);
 setError(null);
 setExtractedData(null);

 try {
 console.log(' Processing image with KANAKUAI OCR...');
 const startTime = performance.now();

 // Use Tesseract OCR + KANAKUAI
 const ocrResult = await ocrEngine.extractExpenseData(imageFile);

 const processingTime = performance.now() - startTime;
 console.log(` OCR + AI processing completed in ${processingTime.toFixed(2)}ms`);

 setExtractedData(ocrResult);
 setConfidence(ocrResult.confidence);

 // AUTO-FILL FORM if confidence is good
 if (ocrResult.confidence > 0.7 && ocrResult.amount) {
 const formData = {
 amount: ocrResult.amount!,
 category: ocrResult.category || 'Others',
 description: ocrResult.merchant || 'Expense from receipt',
 merchant: ocrResult.merchant,
 date: ocrResult.date || new Date().toISOString().split('T')[0],
 };

 console.log(' Auto-filling form with data:', formData);
 onExpenseData(formData);

 // Auto-close after successful fill
 setTimeout(() => onClose(), 1000);
 }

 } catch (error) {
 console.error(' Image processing failed:', error);
 setError('Failed to process image. Please try again.');
 } finally {
 setIsProcessing(false);
 }
 };

 // VOICE PROCESSING
 const handleVoiceInput = async () => {
 setIsProcessing(true);
 setError(null);
 setExtractedData(null);

 try {
 console.log(' Starting voice input with KANAKUAI...');

 // Use Voice AI + KANAKUIntelligence
 const voiceResults = await voiceProcessor.startListening();

 if (voiceResults.length > 0) {
 const result = voiceResults[0]; // Use first result
 setExtractedData(result);
 setConfidence(result.confidence);

 // AUTO-FILL FORM if confidence is good
 if (result.confidence > 0.7 && result.amount) {
 const formData = {
 amount: result.amount!,
 category: result.category || 'Others',
 description: result.description,
 merchant: result.merchant,
 date: result.date || new Date().toISOString().split('T')[0],
 };

 console.log(' Auto-filling form with voice data:', formData);
 onExpenseData(formData);

 // Auto-close after successful fill
 setTimeout(() => onClose(), 1000);
 }
 }

 } catch (error) {
 console.error(' Voice processing failed:', error);
 setError('Voice recognition failed. Please try again.');
 } finally {
 setIsProcessing(false);
 }
 };

 // FILE UPLOAD PROCESSING
 const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
 const file = event.target.files?.[0];
 if (!file) return;

 // Validate file type
 const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
 if (!validTypes.includes(file.type)) {
 setError('Please upload a valid image (JPEG, PNG, WebP) or PDF file');
 return;
 }

 await handleImageCapture(file);
 };

 // MANUAL CONFIRMATION (for lower confidence results)
 const handleConfirmData = () => {
 if (!extractedData) return;

 let formData: any = {
 amount: 0,
 category: 'Others',
 description: 'Expense',
 };

 if (isVoiceExpenseResult(extractedData)) {
 formData = {
 amount: extractedData.amount || 0,
 category: extractedData.category || 'Others',
 description: extractedData.description,
 merchant: extractedData.merchant,
 date: extractedData.date || new Date().toISOString().split('T')[0],
 };
 } else {
 formData = {
 amount: extractedData.amount || 0,
 category: extractedData.category || 'Others',
 description: extractedData.merchant || 'Expense from receipt',
 merchant: extractedData.merchant,
 date: extractedData.date || new Date().toISOString().split('T')[0],
 };
 }

 console.log(' Manually confirmed form data:', formData);
 onExpenseData(formData);
 onClose();
 };

 // LEARN FROM FEEDBACK
 const handleFeedback = async (isCorrect: boolean) => {
 if (!extractedData) return;

 try {
 // Learn from user feedback
 if ('merchant' in extractedData && extractedData.merchant) {
 await KANAKUAI.learnFromFeedback(
 userId,
 extractedData.merchant,
 extractedData.category || 'Others',
 undefined,
 isCorrect ? 'positive' : 'negative'
 );
 }

 if (isCorrect) {
 handleConfirmData();
 } else {
 // Reset for manual entry
 setExtractedData(null);
 setConfidence(0);
 }

 } catch (error) {
 console.error('Failed to store feedback:', error);
 }
 };

 const getConfidenceColor = (conf: number) => {
 if (conf > 0.8) return 'text-green-600';
 if (conf > 0.6) return 'text-yellow-600';
 return 'text-red-600';
 };

 const getConfidenceIcon = (conf: number) => {
 if (conf > 0.8) return <Check className="w-4 h-4" />;
 if (conf > 0.6) return <AlertCircle className="w-4 h-4" />;
 return <X className="w-4 h-4" />;
 };

 return (
 <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
 <motion.div
 initial={{ opacity: 0, scale: 0.9 }}
 animate={{ opacity: 1, scale: 1 }}
 exit={{ opacity: 0, scale: 0.9 }}
 className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
 >
 {/* Header */}
 <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 text-white">
 <div className="flex items-center justify-between">
 <div className="flex items-center space-x-2">
 <Brain className="w-5 h-5" />
 <h3 className="font-semibold">KANAKUAI</h3>
 </div>
 <button
 onClick={onClose}
 className="p-1 hover:bg-white/20 rounded-lg transition-colors"
 >
 <X className="w-5 h-5" />
 </button>
 </div>
 <p className="text-blue-100 text-sm mt-1">
 Instant expense entry with AI-powered auto-fill
 </p>
 </div>

 {/* Tabs */}
 <div className="flex border-b border-gray-200">
 <button
 onClick={() => setActiveTab('camera')}
 className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${activeTab === 'camera'
 ? 'text-blue-600 border-b-2 border-blue-600'
 : 'text-gray-600 hover:text-gray-900'
 }`}
 >
 <Camera className="w-4 h-4 inline mr-2" />
 Camera
 </button>
 {voiceEnabled && (
    <button
    onClick={() => setActiveTab('voice')}
    className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${activeTab === 'voice'
    ? 'text-blue-600 border-b-2 border-blue-600'
    : 'text-gray-600 hover:text-gray-900'
    }`}
    >
    <Mic className="w-4 h-4 inline mr-2" />
    Voice
    </button>
  )}
 <button
 onClick={() => setActiveTab('upload')}
 className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${activeTab === 'upload'
 ? 'text-blue-600 border-b-2 border-blue-600'
 : 'text-gray-600 hover:text-gray-900'
 }`}
 >
 <Upload className="w-4 h-4 inline mr-2" />
 Upload
 </button>
 </div>

 {/* Content */}
 <div className="p-6">
 {error && (
 <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
 <p className="text-red-600 text-sm">{error}</p>
 </div>
 )}

 {isProcessing ? (
 <div className="text-center py-8">
 <div className="inline-flex items-center space-x-3">
 <Zap className="w-6 h-6 text-blue-600 animate-pulse" />
 <span className="text-gray-600">Processing with KANAKUAI...</span>
 </div>
 </div>
 ) : extractedData ? (
 <div className="space-y-4">
 {/* Confidence Indicator */}
 <div className="flex items-center justify-between p-3 bg-white rounded-lg">
 <div className="flex items-center space-x-2">
 <span className={`inline-flex items-center ${getConfidenceColor(confidence)}`}>
 {getConfidenceIcon(confidence)}
 </span>
 <span className="text-sm font-medium">
 {(confidence * 100).toFixed(1)}% Confidence
 </span>
 </div>
 <span className="text-sm text-gray-600">
 {confidence > 0.8 ? 'High' : confidence > 0.6 ? 'Medium' : 'Low'}
 </span>
 </div>

 {/* Extracted Data */}
 <div className="space-y-3">
 <div className="flex justify-between items-center py-2 border-b border-gray-100">
 <span className="text-sm text-gray-600">Amount</span>
 <span className="font-semibold">
 INR{extractedData.amount?.toLocaleString('en-IN') || 'Not detected'}
 </span>
 </div>

 <div className="flex justify-between items-center py-2 border-b border-gray-100">
 <span className="text-sm text-gray-600">Category</span>
 <span className="font-semibold">
 {extractedData.category || 'Not detected'}
 </span>
 </div>

 <div className="flex justify-between items-center py-2 border-b border-gray-100">
 <span className="text-sm text-gray-600">Description</span>
 <span className="font-semibold text-right max-w-[200px] truncate">
 {isVoiceExpenseResult(extractedData)
 ? extractedData.description
 : extractedData.merchant || `${extractedData.rawText?.substring(0, 50) || 'Expense from receipt'}...`}
 </span>
 </div>

 {('date' in extractedData && extractedData.date) && (
 <div className="flex justify-between items-center py-2">
 <span className="text-sm text-gray-600">Date</span>
 <span className="font-semibold">{extractedData.date}</span>
 </div>
 )}
 </div>

 {/* Action Buttons */}
 <div className="flex space-x-3 pt-4">
 {confidence > 0.7 ? (
 <button
 onClick={handleConfirmData}
 className="flex-1 bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
 >
 <Check className="w-4 h-4" />
 Auto-Fill Expense
 </button>
 ) : (
 <>
 <button
 onClick={() => handleFeedback(false)}
 className="flex-1 bg-red-600 text-white py-3 rounded-lg font-medium hover:bg-red-700 transition-colors"
 >
 Edit Manually
 </button>
 <button
 onClick={() => handleFeedback(true)}
 className="flex-1 bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
 >
 Looks Correct
 </button>
 </>
 )}
 </div>
 </div>
 ) : (
 <div className="text-center py-8">
 {/* Camera Tab */}
 {activeTab === 'camera' && (
 <div>
 <Camera className="w-12 h-12 text-gray-400 mx-auto mb-4" />
 <p className="text-gray-600 mb-4">Take a photo of your receipt</p>
 <input
 type="file"
 accept="image/*"
 capture="environment"
 onChange={handleFileUpload}
 className="hidden"
 id="camera-input"
 />
 <label
 htmlFor="camera-input"
 className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors cursor-pointer"
 >
 Open Camera
 </label>
 </div>
 )}

 {/* Voice Tab */}
 {activeTab === 'voice' && (
 <div>
 <Mic className="w-12 h-12 text-gray-400 mx-auto mb-4" />
 <p className="text-gray-600 mb-4">Speak your expense details</p>
 <button
 onClick={handleVoiceInput}
 className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2"
 >
 <Mic className="w-4 h-4" />
 Start Recording
 </button>
 </div>
 )}

 {/* Upload Tab */}
 {activeTab === 'upload' && (
 <div>
 <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
 <p className="text-gray-600 mb-4">Upload receipt or invoice</p>
 <input
 type="file"
 accept="image/*,.pdf"
 onChange={handleFileUpload}
 className="hidden"
 id="file-input"
 />
 <label
 htmlFor="file-input"
 className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors cursor-pointer"
 >
 Choose File
 </label>
 </div>
 )}
 </div>
 )}
 </div>
 </motion.div>
 </div>
 );
};


