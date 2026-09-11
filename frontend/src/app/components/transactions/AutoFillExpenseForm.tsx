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
        className="bg-white rounded-[28px] sm:rounded-[36px] w-full max-w-md overflow-hidden shadow-2xl border border-slate-100"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Brain className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">KANAKUAI</h3>
          </div>
          <button
            data-testid="auto-fill-expense-form-button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200/80 transition-colors flex items-center justify-center text-slate-700 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 pb-1">
          <div className="flex p-1 bg-slate-100/90 rounded-full gap-1">
            <button
              data-testid="auto-fill-expense-form-camera"
              onClick={() => setActiveTab('camera')}
              className={`flex-1 py-2 px-3 text-xs font-bold rounded-full transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'camera'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              Camera
            </button>
            {voiceEnabled && (
              <button
                data-testid="auto-fill-expense-form-voice"
                onClick={() => setActiveTab('voice')}
                className={`flex-1 py-2 px-3 text-xs font-bold rounded-full transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'voice'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                Voice
              </button>
            )}
            <button
              data-testid="auto-fill-expense-form-upload"
              onClick={() => setActiveTab('upload')}
              className={`flex-1 py-2 px-3 text-xs font-bold rounded-full transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'upload'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Upload
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl">
              <p className="text-rose-600 text-xs font-semibold">{error}</p>
            </div>
          )}

          {isProcessing ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center space-x-3">
                <Zap className="w-6 h-6 text-indigo-600 animate-pulse" />
                <span className="text-slate-600 font-semibold text-sm">Processing with KANAKUAI...</span>
              </div>
            </div>
          ) : extractedData ? (
            <div className="space-y-4">
              {/* Confidence Indicator */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100">
                <div className="flex items-center space-x-2">
                  <span className={`inline-flex items-center ${getConfidenceColor(confidence)}`}>
                    {getConfidenceIcon(confidence)}
                  </span>
                  <span className="text-xs font-bold text-slate-900">
                    {(confidence * 100).toFixed(1)}% Confidence
                  </span>
                </div>
                <span className="text-xs font-semibold text-slate-500">
                  {confidence > 0.8 ? 'High' : confidence > 0.6 ? 'Medium' : 'Low'}
                </span>
              </div>

              {/* Extracted Data */}
              <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/40 p-4">
                <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                  <span className="text-xs text-slate-500 font-medium">Amount</span>
                  <span className="text-sm font-bold text-slate-900">
                    INR {extractedData.amount?.toLocaleString('en-IN') || 'Not detected'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                  <span className="text-xs text-slate-500 font-medium">Category</span>
                  <span className="text-sm font-bold text-slate-900">
                    {extractedData.category || 'Not detected'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                  <span className="text-xs text-slate-500 font-medium">Description</span>
                  <span className="text-sm font-bold text-slate-900 text-right max-w-[200px] truncate">
                    {isVoiceExpenseResult(extractedData)
                      ? extractedData.description
                      : extractedData.merchant || `${extractedData.rawText?.substring(0, 50) || 'Expense from receipt'}...`}
                  </span>
                </div>

                {('date' in extractedData && extractedData.date) && (
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-xs text-slate-500 font-medium">Date</span>
                    <span className="text-sm font-bold text-slate-900">{extractedData.date}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3 pt-2">
                {confidence > 0.7 ? (
                  <button
                    data-testid="auto-fill-expense-form-auto-fill-expense"
                    onClick={handleConfirmData}
                    className="flex-1 bg-emerald-600 text-white py-3 rounded-full font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center space-x-2 cursor-pointer shadow-xs"
                  >
                    <Check className="w-4 h-4" />
                    <span>Auto-Fill Expense</span>
                  </button>
                ) : (
                  <>
                    <button
                      data-testid="auto-fill-expense-form-edit-manually"
                      onClick={() => handleFeedback(false)}
                      className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-full font-bold hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      Edit Manually
                    </button>
                    <button
                      data-testid="auto-fill-expense-form-looks-correct"
                      onClick={() => handleFeedback(true)}
                      className="flex-1 bg-emerald-600 text-white py-3 rounded-full font-bold hover:bg-emerald-700 transition-colors cursor-pointer shadow-xs"
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
                  <Camera className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600 text-sm font-medium mb-4">Take a photo of your receipt</p>
                  <input
                    data-testid="auto-fill-expense-form-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="camera-input"
                  />
                  <label
                    htmlFor="camera-input"
                    className="inline-flex items-center px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-full font-bold text-sm transition-colors cursor-pointer shadow-xs"
                  >
                    Open Camera
                  </label>
                </div>
              )}

              {/* Voice Tab */}
              {activeTab === 'voice' && (
                <div>
                  <Mic className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600 text-sm font-medium mb-4">Speak your expense details</p>
                  <button
                    data-testid="auto-fill-expense-form-start-recording"
                    onClick={handleVoiceInput}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-full font-bold text-sm transition-colors cursor-pointer shadow-xs"
                  >
                    <Mic className="w-4 h-4" />
                    <span>Start Recording</span>
                  </button>
                </div>
              )}

              {/* Upload Tab */}
              {activeTab === 'upload' && (
                <div>
                  <Upload className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600 text-sm font-medium mb-4">Upload receipt or invoice</p>
                  <input
                    data-testid="auto-fill-expense-form-input-2"
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-input"
                  />
                  <label
                    htmlFor="file-input"
                    className="inline-flex items-center px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-full font-bold text-sm transition-colors cursor-pointer shadow-xs"
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
