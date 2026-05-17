import React from 'react';

interface CenteredLayoutProps {
  children: React.ReactNode;
  maxWidth?: string;
}

export const CenteredLayout: React.FC<CenteredLayoutProps> = ({ 
  children, 
  maxWidth = 'max-w-[1920px]' 
}) => {
  return (
    <div className="w-full min-h-screen bg-white overflow-x-hidden flex flex-col justify-start items-center">
      <div className={`${maxWidth} w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 pt-4 sm:pt-5 lg:pt-6 pb-24 lg:pb-10 flex flex-col flex-1`}>
        {children}
      </div>
    </div>
  );
};

