import React from 'react';
import { AutoContainer, AutoCard, AutoText, AutoButton } from '@/app/components/ui/AutoSizing';

export const AutoSizingTest: React.FC = () => {
 return (
 <div className="min-h-screen bg-white p-4">
 <AutoContainer size="normal">
 <h1 className="text-2xl font-bold mb-6">Auto-Sizing Test</h1>
 
 <AutoCard size="normal" height="medium" className="bg-white rounded-lg shadow-md p-6 mb-6">
 <AutoText size="base" className="text-gray-600 mb-4">
 This card should auto-resize based on viewport width. Try resizing your browser window.
 </AutoText>
 
 <div className="space-y-4">
 <div>
 <AutoText size="sm" className="font-medium text-gray-900">Text Sizes:</AutoText>
 <div className="mt-2 space-y-2">
 <AutoText size="xs" className="text-blue-600">Extra Small Text (auto-sizes)</AutoText>
 <AutoText size="sm" className="text-green-600">Small Text (auto-sizes)</AutoText>
 <AutoText size="base" className="text-purple-600">Base Text (auto-sizes)</AutoText>
 <AutoText size="lg" className="text-orange-600">Large Text (auto-sizes)</AutoText>
 <AutoText size="xl" className="text-red-600">Extra Large Text (auto-sizes)</AutoText>
 </div>
 </div>
 
 <div>
 <AutoText size="sm" className="font-medium text-gray-900">Button Sizes:</AutoText>
 <div className="mt-2 flex flex-wrap gap-2">
 <AutoButton size="sm" variant="outline">Small Button</AutoButton>
 <AutoButton size="normal" variant="primary">Normal Button</AutoButton>
 <AutoButton size="lg" variant="secondary">Large Button</AutoButton>
 </div>
 </div>
 </div>
 </AutoCard>
 
 <AutoCard size="normal" height="medium" className="bg-white rounded-lg shadow-md p-6">
 <AutoText size="base" className="text-gray-600 mb-4">
 This card should also auto-resize. The height should adapt to viewport.
 </AutoText>
 
 <div className="h-32 bg-gradient-to-r from-blue-100 to-purple-100 rounded-lg flex items-center justify-center">
 <AutoText size="lg" className="text-gray-700 font-medium">
 Auto-sized height content
 </AutoText>
 </div>
 </AutoCard>
 </AutoContainer>
 </div>
 );
};
