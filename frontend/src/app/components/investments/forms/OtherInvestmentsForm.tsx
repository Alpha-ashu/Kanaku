import React, { useRef } from 'react';
import { SubcategoryCode, PropertyDetailsV2, BusinessDetailsV2, InvestmentDocumentV2, PropertyType } from '@/types/investmentV2';
import { Building2, Home, Paperclip, FileText, CheckCircle2, ShieldCheck, DollarSign, Upload, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface OtherInvestmentsFormProps {
  subcategory: SubcategoryCode;
  propertyDetails: PropertyDetailsV2;
  setPropertyDetails: React.Dispatch<React.SetStateAction<PropertyDetailsV2>>;
  businessDetails: BusinessDetailsV2;
  setBusinessDetails: React.Dispatch<React.SetStateAction<BusinessDetailsV2>>;
  documents: InvestmentDocumentV2[];
  setDocuments: React.Dispatch<React.SetStateAction<InvestmentDocumentV2[]>>;
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  currency: string;
}

export const OtherInvestmentsForm: React.FC<OtherInvestmentsFormProps> = ({
  subcategory,
  propertyDetails,
  setPropertyDetails,
  businessDetails,
  setBusinessDetails,
  documents,
  setDocuments,
  formData,
  setFormData,
  currency,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const docType: InvestmentDocumentV2['documentType'] =
        file.name.toLowerCase().includes('deed') ? 'sale_deed' :
        file.name.toLowerCase().includes('tax') ? 'tax_receipt' :
        file.name.toLowerCase().includes('encumbrance') ? 'encumbrance' :
        file.name.toLowerCase().includes('valuation') ? 'valuation_report' : 'other';

      const newDoc: InvestmentDocumentV2 = {
        id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        documentName: file.name,
        documentType: docType,
        fileUrl: URL.createObjectURL(file),
        uploadedAt: new Date(),
      };

      setDocuments(prev => [...prev, newDoc]);
    });

    toast.success(`Uploaded ${files.length} document(s)`);
  };

  const handleRemoveDoc = (id?: string) => {
    if (!id) return;
    setDocuments(prev => prev.filter(d => d.id !== id));
  };

  if (subcategory === 'property') {
    return (
      <div className="space-y-5">
        {/* Core Property Details */}
        <div className="bg-slate-50/80 border border-slate-200/80 p-5 rounded-2xl space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200/60 pb-3">
            <Home size={16} className="text-emerald-600" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Property Details</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Property Type</label>
              <select
                value={propertyDetails.propertyType || 'residential'}
                onChange={e => setPropertyDetails(prev => ({ ...prev, propertyType: e.target.value as PropertyType }))}
                className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none cursor-pointer"
              >
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="agriculture">Agriculture</option>
                <option value="land">Plot / Land</option>
                <option value="rental">Rental Property</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Location / City</label>
              <input
                type="text"
                value={propertyDetails.location || ''}
                onChange={e => setPropertyDetails(prev => ({ ...prev, location: e.target.value }))}
                className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                placeholder="e.g. Bandra, Mumbai"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Ownership (%)</label>
              <input
                type="number"
                value={propertyDetails.ownershipPercentage || 100}
                onChange={e => setPropertyDetails(prev => ({ ...prev, ownershipPercentage: parseFloat(e.target.value) || 0 }))}
                className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                min={0} max={100}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Co-owner Name (if any)</label>
              <input
                type="text"
                value={propertyDetails.coOwner || ''}
                onChange={e => setPropertyDetails(prev => ({ ...prev, coOwner: e.target.value }))}
                className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                placeholder="Co-owner Name"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-600">Area (sq.ft)</label>
              <input
                type="number"
                value={propertyDetails.areaSqft || ''}
                onChange={e => setPropertyDetails(prev => ({ ...prev, areaSqft: parseFloat(e.target.value) || 0 }))}
                className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                placeholder="1200"
              />
            </div>
          </div>
        </div>

        {/* Rental Income Section */}
        <div className="bg-emerald-50/60 border border-emerald-200/80 p-5 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign size={18} className="text-emerald-700" />
              <div>
                <h3 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Rental Income Integration</h3>
                <p className="text-[11px] text-emerald-700 font-medium">Link this property to Income & Cash Flow</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-700">Rental Property?</span>
              <button
                type="button"
                onClick={() => setPropertyDetails(prev => ({ ...prev, isRental: !prev.isRental }))}
                className={cn(
                  'relative w-12 h-6 rounded-full transition-colors duration-200 cursor-pointer',
                  propertyDetails.isRental ? 'bg-emerald-600' : 'bg-slate-300'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 shadow-xs',
                    propertyDetails.isRental ? 'translate-x-6' : 'translate-x-0'
                  )}
                />
              </button>
            </div>
          </div>

          {propertyDetails.isRental && (
            <div className="pt-3 border-t border-emerald-200/60 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in zoom-in-95">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-emerald-950">Monthly Rental Income ({currency})</label>
                <input
                  type="number"
                  value={propertyDetails.monthlyRentalIncome || ''}
                  onChange={e => {
                    const m = parseFloat(e.target.value) || 0;
                    setPropertyDetails(prev => ({ ...prev, monthlyRentalIncome: m, annualRentalIncome: m * 12 }));
                  }}
                  className="w-full h-11 bg-white border border-emerald-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                  placeholder="25000"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-emerald-950">Annual Rental Income ({currency})</label>
                <input
                  type="number"
                  value={propertyDetails.annualRentalIncome || ''}
                  onChange={e => setPropertyDetails(prev => ({ ...prev, annualRentalIncome: parseFloat(e.target.value) || 0 }))}
                  className="w-full h-11 bg-white border border-emerald-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                  placeholder="300000"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-emerald-950">Tenant Since</label>
                <input
                  type="date"
                  value={propertyDetails.tenantSince || ''}
                  onChange={e => setPropertyDetails(prev => ({ ...prev, tenantSince: e.target.value }))}
                  className="w-full h-11 bg-white border border-emerald-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                />
              </div>

              <div className="flex items-center justify-between sm:col-span-2 pt-2">
                <span className="text-xs font-bold text-emerald-900">Automatically Create Recurring Rental Income?</span>
                <button
                  type="button"
                  onClick={() => setPropertyDetails(prev => ({ ...prev, recurringIncomeEnabled: !prev.recurringIncomeEnabled }))}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
                    propertyDetails.recurringIncomeEnabled
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-300'
                  )}
                >
                  {propertyDetails.recurringIncomeEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Property Loan Section */}
        <div className="bg-indigo-50/60 border border-indigo-200/80 p-5 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-indigo-700" />
              <div>
                <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-wider">Property Loan Integration</h3>
                <p className="text-[11px] text-indigo-700 font-medium">Link this property to a Home Loan in Loans Module</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-700">Is Property Financed?</span>
              <button
                type="button"
                onClick={() => setPropertyDetails(prev => ({ ...prev, isFinanced: !prev.isFinanced }))}
                className={cn(
                  'relative w-12 h-6 rounded-full transition-colors duration-200 cursor-pointer',
                  propertyDetails.isFinanced ? 'bg-indigo-600' : 'bg-slate-300'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 shadow-xs',
                    propertyDetails.isFinanced ? 'translate-x-6' : 'translate-x-0'
                  )}
                />
              </button>
            </div>
          </div>

          {propertyDetails.isFinanced && (
            <div className="pt-3 border-t border-indigo-200/60 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in zoom-in-95">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-indigo-950">Mortgage Bank / Institution</label>
                <input
                  type="text"
                  value={propertyDetails.bankName || ''}
                  onChange={e => setPropertyDetails(prev => ({ ...prev, bankName: e.target.value }))}
                  className="w-full h-11 bg-white border border-indigo-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  placeholder="e.g. HDFC Home Loan, SBI"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-indigo-950">Home Loan Amount ({currency})</label>
                <input
                  type="number"
                  value={propertyDetails.loanAmount || ''}
                  onChange={e => setPropertyDetails(prev => ({ ...prev, loanAmount: parseFloat(e.target.value) || 0 }))}
                  className="w-full h-11 bg-white border border-indigo-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-indigo-950">Interest Rate (%)</label>
                <input
                  type="number"
                  value={propertyDetails.interestRate || ''}
                  onChange={e => setPropertyDetails(prev => ({ ...prev, interestRate: parseFloat(e.target.value) || 0 }))}
                  className="w-full h-11 bg-white border border-indigo-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  placeholder="8.5"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-indigo-950">Loan Start Date</label>
                <input
                  type="date"
                  value={propertyDetails.loanDate || formData.date || ''}
                  onChange={e => setPropertyDetails(prev => ({ ...prev, loanDate: e.target.value }))}
                  className="w-full h-11 bg-white border border-indigo-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Property Documents Section */}
        <div className="bg-slate-50/80 border border-slate-200/80 p-5 rounded-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
            <div className="flex items-center gap-2">
              <Paperclip size={16} className="text-slate-600" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Property Documents (Optional)</h3>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Upload size={14} /> Upload Document
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx"
            onChange={handleFileUpload}
            className="hidden"
          />

          {documents.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {documents.map(doc => (
                <div key={doc.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText size={16} className="text-indigo-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{doc.documentName}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-semibold">{doc.documentType.replace('_', ' ')}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveDoc(doc.id)}
                    className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 border-2 border-dashed border-slate-200 rounded-xl">
              <p className="text-xs font-semibold text-slate-500">Sale Deed, Tax Receipt, Registration Certificate, Valuation Reports</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (subcategory === 'business') {
    return (
      <div className="space-y-4 bg-slate-50/80 border border-slate-200/80 p-5 rounded-2xl">
        <div className="flex items-center gap-2 border-b border-slate-200/60 pb-3">
          <Building2 size={16} className="text-emerald-600" />
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Business Investment Details</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Business Name</label>
            <input
              type="text"
              value={businessDetails.businessName || formData.name || ''}
              onChange={e => {
                const name = e.target.value;
                setBusinessDetails(prev => ({ ...prev, businessName: name }));
                setFormData((prev: any) => ({ ...prev, name }));
              }}
              className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              placeholder="e.g. Apex Retail Private Limited"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Business Type / Industry</label>
            <input
              type="text"
              value={businessDetails.businessType || ''}
              onChange={e => setBusinessDetails(prev => ({ ...prev, businessType: e.target.value }))}
              className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              placeholder="e.g. E-commerce, Retail, Tech"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Ownership (%)</label>
            <input
              type="number"
              value={businessDetails.ownershipPercentage || ''}
              onChange={e => setBusinessDetails(prev => ({ ...prev, ownershipPercentage: parseFloat(e.target.value) || 0 }))}
              className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              placeholder="e.g. 25"
              min={0} max={100}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Estimated Current Value ({currency})</label>
            <input
              type="number"
              value={businessDetails.estimatedValue || formData.currentPrice || ''}
              onChange={e => {
                const val = parseFloat(e.target.value) || 0;
                setBusinessDetails(prev => ({ ...prev, estimatedValue: val }));
                setFormData((prev: any) => ({ ...prev, currentPrice: val }));
              }}
              className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              placeholder="500000"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Annual Revenue ({currency})</label>
            <input
              type="number"
              value={businessDetails.annualRevenue || ''}
              onChange={e => setBusinessDetails(prev => ({ ...prev, annualRevenue: parseFloat(e.target.value) || 0 }))}
              className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              placeholder="1200000"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Annual Profit ({currency})</label>
            <input
              type="number"
              value={businessDetails.annualProfit || ''}
              onChange={e => setBusinessDetails(prev => ({ ...prev, annualProfit: parseFloat(e.target.value) || 0 }))}
              className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              placeholder="300000"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">GSTIN / Registration No. (Optional)</label>
            <input
              type="text"
              value={businessDetails.gstNumber || ''}
              onChange={e => setBusinessDetails(prev => ({ ...prev, gstNumber: e.target.value }))}
              className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              placeholder="22AAAAA0000A1Z5"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Business PAN (Optional)</label>
            <input
              type="text"
              value={businessDetails.panNumber || ''}
              onChange={e => setBusinessDetails(prev => ({ ...prev, panNumber: e.target.value.toUpperCase() }))}
              className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 uppercase placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              placeholder="ABCDE1234F"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 bg-slate-50/80 border border-slate-200/80 p-5 rounded-2xl">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-600">Investment Name</label>
        <input
          type="text"
          value={formData.name || ''}
          onChange={e => setFormData((prev: any) => ({ ...prev, name: e.target.value }))}
          className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
          placeholder="e.g. Rare Art Collectible, Startup Equity"
        />
      </div>
    </div>
  );
};
