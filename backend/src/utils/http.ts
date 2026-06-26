import { Response } from 'express';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
  }
}

export const sendResponse = (
  res: Response,
  statusCode: number,
  data?: any,
  message?: string
) => {
  res.status(statusCode).json({
    success: statusCode >= 200 && statusCode < 300,
    message,
    data,
  });
};
