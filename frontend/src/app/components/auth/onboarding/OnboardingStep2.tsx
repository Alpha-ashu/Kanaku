import React, { useState } from 'react';
import { Calendar } from 'lucide-react';

interface OnboardingStep2Props {
 data: {
 firstName: string;
 lastName: string;
 salary: string;
 dateOfBirth: string;
 jobType: string;
 };
 onUpdate: (data: any) => void;
 onNext: () => void;
 onBack: () => void;
}

const JOB_TYPES = [
 'Full-time Employment',
 'Part-time Employment',
 'Self-employed',
 'Freelance',
 'Business Owner',
 'Student',
 'Retired',
 'Unemployed',
 'Other',
];

export const OnboardingStep2: React.FC<OnboardingStep2Props> = ({
 data,
 onUpdate,
 onNext,
 onBack,
}) => {
 const [errors, setErrors] = useState<Record<string, string>>({});

 const validateForm = () => {
 const newErrors: Record<string, string> = {};

 if (!data.firstName.trim()) {
 newErrors.firstName = 'First name is required';
 }

 if (!data.lastName.trim()) {
 newErrors.lastName = 'Last name is required';
 }

 if (!data.salary) {
 newErrors.salary = 'Salary is required';
 } else if (isNaN(Number(data.salary)) || Number(data.salary) < 0) {
 newErrors.salary = 'Please enter a valid salary amount';
 }

 if (!data.dateOfBirth) {
 newErrors.dateOfBirth = 'Date of birth is required';
 } else {
 const dob = new Date(data.dateOfBirth);
 const today = new Date();
 const age = today.getFullYear() - dob.getFullYear();
 if (age < 18 || age > 120) {
 newErrors.dateOfBirth = 'You must be between 18 and 120 years old';
 }
 }

 if (!data.jobType) {
 newErrors.jobType = 'Job type is required';
 }

 setErrors(newErrors);
 return Object.keys(newErrors).length === 0;
 };

 const handleSubmit = (e: React.FormEvent) => {
 e.preventDefault();
 if (validateForm()) {
 onNext();
 }
 };

 return (
 <form onSubmit={handleSubmit} className="space-y-4">
 <div>
 <h3 className="text-lg font-medium text-gray-900 mb-2">
 Profile Setup
 </h3>
 <p className="text-sm text-gray-600 mb-6">
 Please provide your profile information. All fields are required.
 </p>
 </div>

 <div className="grid grid-cols-2 gap-4">
 <div>
 <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
 First Name
 </label>
 <input
 type="text"
 id="firstName"
 value={data.firstName}
 onChange={(e) => onUpdate({ firstName: e.target.value })}
 className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
 errors.firstName ? 'border-red-500' : 'border-gray-300'
 }`}
 placeholder="John"
 />
 {errors.firstName && (
 <p className="mt-1 text-sm text-red-600">{errors.firstName}</p>
 )}
 </div>

 <div>
 <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
 Last Name
 </label>
 <input
 type="text"
 id="lastName"
 value={data.lastName}
 onChange={(e) => onUpdate({ lastName: e.target.value })}
 className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
 errors.lastName ? 'border-red-500' : 'border-gray-300'
 }`}
 placeholder="Doe"
 />
 {errors.lastName && (
 <p className="mt-1 text-sm text-red-600">{errors.lastName}</p>
 )}
 </div>
 </div>

 <div>
 <label htmlFor="salary" className="block text-sm font-medium text-gray-700 mb-1">
 Annual Salary ($)
 </label>
 <input
 type="number"
 id="salary"
 value={data.salary}
 onChange={(e) => onUpdate({ salary: e.target.value })}
 className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
 errors.salary ? 'border-red-500' : 'border-gray-300'
 }`}
 placeholder="50000"
 />
 {errors.salary && (
 <p className="mt-1 text-sm text-red-600">{errors.salary}</p>
 )}
 </div>

  <div>
  <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700 mb-1">
  Date of Birth
  </label>
  <div 
     className="relative group w-full" 
     onClick={(e) => {
       const input = e.currentTarget.querySelector('input');
       if (input) (input as any).showPicker?.();
     }}
   >
     <div className={`w-full px-4 py-3 border rounded-xl focus-within:ring-2 focus-within:ring-blue-500 text-sm text-left flex items-center justify-between bg-white min-h-[46px] cursor-pointer ${
       errors.dateOfBirth ? 'border-red-500' : 'border-gray-300'
     }`}>
       <span className={data.dateOfBirth ? "text-gray-900" : "text-gray-400"}>
         {(() => {
           if (!data.dateOfBirth) return 'Select Date';
           try {
             const date = new Date(data.dateOfBirth);
             if (isNaN(date.getTime())) return data.dateOfBirth;
             const day = String(date.getDate()).padStart(2, '0');
             const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
             return `${day}-${months[date.getMonth()]}-${date.getFullYear()}`;
           } catch (err) {
             return data.dateOfBirth;
           }
         })()}
       </span>
       <Calendar size={14} className="text-gray-400" />
     </div>
     <input
       type="date"
       id="dateOfBirth"
       value={data.dateOfBirth}
       onChange={(e) => onUpdate({ dateOfBirth: e.target.value })}
       className="absolute inset-0 opacity-0 cursor-pointer z-20"
       max={new Date().toISOString().split('T')[0]}
     />
   </div>
  {errors.dateOfBirth && (
  <p className="mt-1 text-sm text-red-600">{errors.dateOfBirth}</p>
  )}
  </div>

 <div>
 <label htmlFor="jobType" className="block text-sm font-medium text-gray-700 mb-1">
 Job Type
 </label>
 <select
 id="jobType"
 value={data.jobType}
 onChange={(e) => onUpdate({ jobType: e.target.value })}
 className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
 errors.jobType ? 'border-red-500' : 'border-gray-300'
 }`}
 >
 <option value="">Select job type</option>
 {JOB_TYPES.map((job) => (
 <option key={job} value={job}>
 {job}
 </option>
 ))}
 </select>
 {errors.jobType && (
 <p className="mt-1 text-sm text-red-600">{errors.jobType}</p>
 )}
 </div>

 <div className="flex space-x-3">
 <button
 type="button"
 onClick={onBack}
 className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors font-medium"
 >
 Back
 </button>
 <button
 type="submit"
 className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
 >
 Continue to PIN Setup
 </button>
 </div>
 </form>
 );
};
