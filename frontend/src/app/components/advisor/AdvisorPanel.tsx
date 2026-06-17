import React, { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { ChevronLeft, Calendar, Clock, CheckCircle, XCircle, DollarSign, Briefcase } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Advisor Workspace Panel
 * Only accessible to advisor role
 */
interface AvailabilitySlot {
 day: string;
 startTime: string;
 endTime: string;
 isAvailable: boolean;
}

interface BookingRequest {
 id: number;
 userId: string;
 userName: string;
 sessionType: 'chat' | 'audio' | 'video';
 date: string;
 time: string;
 topic: string;
 amount: number;
 status: 'pending' | 'accepted' | 'rejected';
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS = Array.from({ length: 12 }, (_, i) => {
 const hour = 9 + i;
 return `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
});

export const AdvisorPanel: React.FC = () => {
 const { setCurrentPage } = useApp();
 const { role, user, loading, dataReady } = useAuth();
 const [availability, setAvailability] = useState<AvailabilitySlot[]>(
 DAYS.map((day) => ({
 day,
 startTime: '9:00 AM',
 endTime: '5:00 PM',
 isAvailable: true,
 }))
 );

 const [bookings, setBookings] = useState<BookingRequest[]>([
 {
 id: 1,
 userId: 'user-1',
 userName: 'John Doe',
 sessionType: 'video',
 date: '2026-02-15',
 time: '10:00 AM',
 topic: 'Investment Planning',
 amount: 2000,
 status: 'pending',
 },
 {
 id: 2,
 userId: 'user-2',
 userName: 'Jane Smith',
 sessionType: 'audio',
 date: '2026-02-16',
 time: '2:00 PM',
 topic: 'Tax Planning',
 amount: 1500,
 status: 'accepted',
 },
 ]);

 // Redirect non-advisors silently to dashboard
 useEffect(() => {
   if (dataReady && role !== 'advisor' && role !== 'admin') {
     setCurrentPage('dashboard');
   }
 }, [dataReady, role, setCurrentPage]);

 // Show loading state while auth is loading
 if (loading || !dataReady) {
   return (
     <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 p-4 sm:p-6 lg:p-8">
       <div className="max-w-5xl mx-auto">
         <div className="flex items-center justify-center py-20">
           <div className="animate-spin w-10 h-10 border-4 border-gray-200 border-t-blue-600 rounded-full"></div>
         </div>
       </div>
     </div>
   );
 }

 // Don't render anything for non-advisors (redirect will happen via useEffect)
 if (role !== 'advisor' && role !== 'admin') {
 return null;
 }

 const handleToggleAvailability = (dayIndex: number) => {
 setAvailability(
 availability.map((slot, idx) =>
 idx === dayIndex
 ? { ...slot, isAvailable: !slot.isAvailable }
 : slot
 )
 );
 };

 const handleBookingAction = (bookingId: number, action: 'accept' | 'reject') => {
 setBookings(
 bookings.map((booking) =>
 booking.id === bookingId
 ? {
 ...booking,
 status: action === 'accept' ? 'accepted' : 'rejected',
 }
 : booking
 )
 );
 toast.success(
 action === 'accept'
 ? 'Booking accepted! User will be notified.'
 : 'Booking rejected.'
 );
 };

 const pendingBookings = bookings.filter((b) => b.status === 'pending');
 const acceptedBookings = bookings.filter((b) => b.status === 'accepted');
 const totalEarning = bookings
 .filter((b) => b.status === 'accepted')
 .reduce((sum, b) => sum + b.amount, 0);

 return (
 <div className="w-full min-h-screen overflow-x-hidden bg-white">
 <div className="max-w-[1400px] mx-auto pb-32 lg:pb-24 w-full">
 <div className="px-4 lg:px-8 pt-6 lg:pt-10 pb-4 lg:pb-6">
 <PageHeader 
 title="Advisor Workspace" 
 subtitle="Manage availability & bookings" 
 icon={<Briefcase size={20} className="sm:w-6 sm:h-6" />}
 showBack
 backTo="dashboard"
 />
 </div>
 <div className="px-4 lg:px-8 space-y-6">
 {/* Stats */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
 <div className="bg-blue-50 rounded-2xl border border-blue-200 p-6">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-blue-600 text-sm font-medium">Pending Bookings</p>
 <p className="text-3xl font-bold text-blue-900 mt-2">{pendingBookings.length}</p>
 </div>
 <Clock size={32} className="text-blue-300" />
 </div>
 </div>

 <div className="bg-green-50 rounded-2xl border border-green-200 p-6">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-green-600 text-sm font-medium">Confirmed Sessions</p>
 <p className="text-3xl font-bold text-green-900 mt-2">{acceptedBookings.length}</p>
 </div>
 <CheckCircle size={32} className="text-green-300" />
 </div>
 </div>

 <div className="bg-purple-50 rounded-2xl border border-purple-200 p-6">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-purple-600 text-sm font-medium">Monthly Earnings</p>
 <p className="text-3xl font-bold text-purple-900 mt-2">{totalEarning.toLocaleString()}</p>
 </div>
 <DollarSign size={32} className="text-purple-300" />
 </div>
 </div>
 </div>

 {/* Availability Schedule */}
 <div className="bg-white rounded-2xl border border-gray-200 p-6">
 <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Availability</h3>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {availability.map((slot, idx) => (
 <div
 key={slot.day}
 className="flex items-center justify-between p-4 bg-white rounded-xl hover:bg-gray-100 transition-colors"
 >
 <div>
 <p className="font-medium text-gray-900">{slot.day}</p>
 <p className="text-sm text-gray-600">
 {slot.startTime} - {slot.endTime}
 </p>
 </div>
 <button
 onClick={() => handleToggleAvailability(idx)}
 className={`px-4 py-2 rounded-lg font-medium transition-colors ${
 slot.isAvailable
 ? 'bg-green-100 text-green-700 hover:bg-green-200'
 : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
 }`}
 data-testid={`advisor-panel-avail-toggle-${idx}`}
 >
 {slot.isAvailable ? 'Available' : 'Off'}
 </button>
 </div>
 ))}
 </div>
 </div>

 {/* Booking Requests */}
 <div className="bg-white rounded-2xl border border-gray-200 p-6">
 <h3 className="text-lg font-semibold text-gray-900 mb-4">
 Booking Requests ({pendingBookings.length})
 </h3>

 {pendingBookings.length === 0 ? (
 <p className="text-gray-500 py-8 text-center">No pending booking requests</p>
 ) : (
 <div className="space-y-4">
 {pendingBookings.map((booking) => (
 <div
 key={booking.id}
 className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl"
 >
 <div className="flex items-start justify-between mb-3">
 <div>
 <p className="font-semibold text-gray-900">{booking.userName}</p>
 <p className="text-sm text-gray-600 mt-1">
"... {booking.date} at {booking.time}
 </p>
 <p className="text-sm text-gray-600">
" {booking.topic} ({booking.sessionType})
 </p>
 </div>
 <p className="font-bold text-lg text-yellow-900">{booking.amount}</p>
 </div>
 <div className="flex gap-2">
 <button
 onClick={() => handleBookingAction(booking.id, 'accept')}
 className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2"
 data-testid={`advisor-panel-booking-accept-${booking.id}`}
 >
 <CheckCircle size={18} />
 Accept
 </button>
 <button
 onClick={() => handleBookingAction(booking.id, 'reject')}
 className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center justify-center gap-2"
 data-testid={`advisor-panel-booking-decline-${booking.id}`}
 >
 <XCircle size={18} />
 Decline
 </button>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>

 {/* Confirmed Sessions */}
 <div className="bg-white rounded-2xl border border-gray-200 p-6">
 <h3 className="text-lg font-semibold text-gray-900 mb-4">
 Confirmed Sessions ({acceptedBookings.length})
 </h3>

 {acceptedBookings.length === 0 ? (
 <p className="text-gray-500 py-8 text-center">No confirmed sessions yet</p>
 ) : (
 <div className="space-y-4">
 {acceptedBookings.map((booking) => (
 <div
 key={booking.id}
 className="p-4 bg-green-50 border border-green-200 rounded-xl"
 >
 <div className="flex items-start justify-between">
 <div>
 <p className="font-semibold text-gray-900">{booking.userName}</p>
 <p className="text-sm text-gray-600 mt-1">
"... {booking.date} at {booking.time}
 </p>
 <p className="text-sm text-gray-600">
" {booking.topic} ({booking.sessionType})
 </p>
 </div>
 <button className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-900 font-medium" data-testid={`advisor-panel-session-start-${booking.id}`}>
  Start Session
 </button>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 </div>
 </div>
 );
};

export default AdvisorPanel;

