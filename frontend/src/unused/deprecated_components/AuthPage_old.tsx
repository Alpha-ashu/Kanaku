import React, { useState } from 'react';
import { SignInForm } from './SignInForm';
import { SignUpForm } from './SignUpForm';

export const AuthPage: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              KANAKU
            </h1>
            <p className="text-sm text-gray-600">
              {isSignUp ? 'Create your account to get started' : 'Welcome back! Sign in to continue'}
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="flex mt-6 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setIsSignUp(false)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${!isSignUp
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
                }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setIsSignUp(true)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${isSignUp
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
                }`}
            >
              Sign Up
            </button>
          </div>
        </div>

        {/* Form Content */}
        <div className="p-6">
          {isSignUp ? (
            <SignUpForm onSwitchToSignIn={() => setIsSignUp(false)} />
          ) : (
            <SignInForm onSwitchToSignUp={() => setIsSignUp(true)} />
          )}
        </div>
      </div>
    </div>
  );
};

