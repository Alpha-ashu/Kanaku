import React from 'react';
import { AppSection, AppCard } from '@/app/components/shared/AppLayout';

export const SimpleAutoTest: React.FC = () => {
 return (
 <div className="space-y-6">
 {/* Header Section */}
 <AppSection>
 <AppCard className="p-4 sm:p-6">
 <h1 className="text-xl font-bold text-center mb-4 sm:mb-6">Auto-Sizing Test</h1>
 </AppCard>
 </AppSection>

 {/* Auto-Text Test Section */}
 <AppSection>
 <AppCard className="p-4 sm:p-6">
 <h2 className="text-lg font-semibold mb-4">Auto-Text Test</h2>
 <div className="space-y-2">
 <p className="auto-text-xs text-blue-600">Extra Small Text (auto-sizes)</p>
 <p className="auto-text-sm text-green-600">Small Text (auto-sizes)</p>
 <p className="auto-text-base text-purple-600">Base Text (auto-sizes)</p>
 <p className="auto-text-lg text-orange-600">Large Text (auto-sizes)</p>
 <p className="auto-text-xl text-red-600">Extra Large Text (auto-sizes)</p>
 </div>
 </AppCard>
 </AppSection>

 {/* Auto-Card Test Section */}
 <AppSection>
 <AppCard className="p-4 sm:p-6">
 <h2 className="text-lg font-semibold mb-4">Auto-Card Test</h2>
 <div className="auto-grid gap-3">
 <div className="auto-card bg-white rounded-lg shadow-md p-3 sm:p-4">
 <h3 className="auto-text-base font-semibold mb-2">Auto Card 1</h3>
 <p className="auto-text-sm text-gray-600">This card auto-resizes based on viewport width.</p>
 </div>
 
 <div className="auto-card bg-white rounded-lg shadow-md p-3 sm:p-4">
 <h3 className="auto-text-base font-semibold mb-2">Auto Card 2</h3>
 <p className="auto-text-sm text-gray-600">This card also auto-resizes and stacks on mobile.</p>
 </div>
 
 <div className="auto-card bg-white rounded-lg shadow-md p-3 sm:p-4">
 <h3 className="auto-text-base font-semibold mb-2">Auto Card 3</h3>
 <p className="auto-text-sm text-gray-600">Grid auto-adjusts columns based on available space.</p>
 </div>
 </div>
 </AppCard>
 </AppSection>

 {/* Auto-Button Test Section */}
 <AppSection>
 <AppCard className="p-4 sm:p-6">
 <h2 className="text-lg font-semibold mb-4">Auto-Button Test</h2>
 <div className="auto-flex flex-wrap gap-2 sm:gap-3">
 <button data-testid="simple-auto-test-auto-button" className="auto-btn bg-blue-600 text-white rounded px-4 py-2">Auto Button</button>
 <button data-testid="simple-auto-test-small-auto" className="auto-btn-sm bg-green-600 text-white rounded px-3 py-2">Small Auto</button>
 <button data-testid="simple-auto-test-large-auto" className="auto-btn-lg bg-purple-600 text-white rounded px-6 py-3">Large Auto</button>
 </div>
 </AppCard>
 </AppSection>

 {/* Auto-Height Test Section */}
 <AppSection>
 <AppCard className="p-4 sm:p-6">
 <h2 className="text-lg font-semibold mb-4">Auto-Height Test</h2>
 <div className="auto-grid gap-3">
 <div className="auto-card auto-height-min bg-white rounded-lg shadow-md p-3 sm:p-4">
 <h3 className="auto-text-base font-semibold mb-2">Min Height</h3>
 <p className="auto-text-sm text-gray-600">Height: clamp(100px, 25vh, 150px)</p>
 </div>
 
 <div className="auto-card auto-height-medium bg-white rounded-lg shadow-md p-3 sm:p-4">
 <h3 className="auto-text-base font-semibold mb-2">Medium Height</h3>
 <p className="auto-text-sm text-gray-600">Height: clamp(150px, 35vh, 250px)</p>
 </div>
 
 <div className="auto-card auto-height-large bg-white rounded-lg shadow-md p-3 sm:p-4">
 <h3 className="auto-text-base font-semibold mb-2">Large Height</h3>
 <p className="auto-text-sm text-gray-600">Height: clamp(200px, 45vh, 350px)</p>
 </div>
 </div>
 </AppCard>
 </AppSection>

 {/* Screen Size Indicator Section */}
 <AppSection>
 <AppCard className="bg-blue-50 p-4 sm:p-6">
 <h2 className="text-lg font-semibold mb-4">Current Screen Size</h2>
 <div className="auto-flex flex-wrap gap-3">
 <div className="bg-white rounded-lg p-3 text-center min-w-[100px]">
 <p className="auto-text-xs text-gray-600 mb-1">Width</p>
 <p className="auto-text-sm font-bold text-blue-600" id="screen-width">-</p>
 </div>
 <div className="bg-white rounded-lg p-3 text-center min-w-[100px]">
 <p className="auto-text-xs text-gray-600 mb-1">Height</p>
 <p className="auto-text-sm font-bold text-green-600" id="screen-height">-</p>
 </div>
 <div className="bg-white rounded-lg p-3 text-center min-w-[100px]">
 <p className="auto-text-xs text-gray-600 mb-1">Breakpoint</p>
 <p className="auto-text-sm font-bold text-purple-600" id="breakpoint">-</p>
 </div>
 </div>
 </AppCard>
 </AppSection>

 {/* Instructions Section */}
 <AppSection>
 <AppCard className="bg-yellow-50 p-4 sm:p-6">
 <h2 className="text-lg font-semibold mb-4">How to Test:</h2>
 <ol className="list-decimal list-inside space-y-2 text-sm">
 <li>Resize browser window from wide to narrow</li>
 <li>Watch text sizes change smoothly</li>
 <li>See grid columns adjust automatically</li>
 <li>Notice button sizes adapt to viewport</li>
 <li>Observe card heights scale with viewport</li>
 <li>Test on 320x480 for smallest screens</li>
 </ol>
 </AppCard>
 </AppSection>

 {/* JavaScript for screen size detection */}
 <script dangerouslySetInnerHTML={{
 __html: `
 function updateScreenSize() {
 const width = window.innerWidth;
 const height = window.innerHeight;
 const widthEl = document.getElementById('screen-width');
 const heightEl = document.getElementById('screen-height');
 const breakpointEl = document.getElementById('breakpoint');
 
 if (widthEl) widthEl.textContent = width + 'px';
 if (heightEl) heightEl.textContent = height + 'px';
 
 let breakpoint = 'Unknown';
 if (width <= 320) breakpoint = 'Mobile XS';
 else if (width <= 480) breakpoint = 'Mobile S';
 else if (width <= 768) breakpoint = 'Tablet';
 else if (width <= 1024) breakpoint = 'Desktop S';
 else breakpoint = 'Desktop L';
 
 if (breakpointEl) breakpointEl.textContent = breakpoint;
 }
 
 updateScreenSize();
 window.addEventListener('resize', updateScreenSize);
 `
 }} />
 </div>
 );
};
