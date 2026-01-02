/**
 * ErrorDialog Component
 * 
 * A modern, user-friendly error dialog that displays multiple errors with actionable next steps.
 * Supports various error types: API, URL, Config, Network, Timeout, and Unknown errors.
 * 
 * @example
 * // Basic usage with a single error
 * <ErrorDialog
 *   open={true}
 *   errors={[{
 *     type: 'api',
 *     message: 'Failed to connect to API',
 *     details: 'The API endpoint returned a 404 error',
 *     code: 404
 *   }]}
 *   onClose={() => setOpen(false)}
 *   onRetry={() => retryConnection()}
 * />
 * 
 * @example
 * // Multiple errors (e.g., config validation)
 * <ErrorDialog
 *   open={true}
 *   errors={[
 *     {
 *       type: 'config',
 *       message: 'n8n webhook URL is not configured',
 *       details: 'Please set VITE_N8N_WEBHOOK_URL in .env.local'
 *     },
 *     {
 *       type: 'config',
 *       message: 'Ivanti base URL is missing',
 *       details: 'Set the Ivanti base URL in config.ts'
 *     }
 *   ]}
 *   onClose={() => setOpen(false)}
 *   onOpenSettings={() => openSettings()}
 * />
 */

import React, { useEffect } from 'react';
import { X, AlertCircle, ExternalLink, RefreshCw, Settings, CheckCircle2 } from 'lucide-react';

export interface ErrorInfo {
  type: 'api' | 'url' | 'config' | 'network' | 'timeout' | 'unknown';
  message: string;
  details?: string;
  code?: string | number;
}

interface ErrorDialogProps {
  open: boolean;
  errors: ErrorInfo[];
  onClose: () => void;
  onRetry?: () => void;
  onOpenSettings?: () => void;
}

const ErrorDialog: React.FC<ErrorDialogProps> = ({
  open,
  errors,
  onClose,
  onRetry,
  onOpenSettings,
}) => {
  // Close dialog on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open || errors.length === 0) return null;

  const getErrorIcon = (type: ErrorInfo['type']) => {
    switch (type) {
      case 'api':
        return <AlertCircle className="sit-w-6 sit-h-6 sit-text-red-500" />;
      case 'url':
        return <AlertCircle className="sit-w-6 sit-h-6 sit-text-orange-500" />;
      case 'config':
        return <Settings className="sit-w-6 sit-h-6 sit-text-gray-500" />;
      case 'network':
        return <AlertCircle className="sit-w-6 sit-h-6 sit-text-blue-500" />;
      case 'timeout':
        return <AlertCircle className="sit-w-6 sit-h-6 sit-text-purple-500" />;
      default:
        return <AlertCircle className="sit-w-6 sit-h-6 sit-text-gray-500" />;
    }
  };

  const getErrorTitle = (type: ErrorInfo['type']) => {
    switch (type) {
      case 'api':
        return 'API Error';
      case 'url':
        return 'URL Configuration Error';
      case 'config':
        return 'Configuration Error';
      case 'network':
        return 'Network Error';
      case 'timeout':
        return 'Request Timeout';
      default:
        return 'Error';
    }
  };

  const getNextSteps = (error: ErrorInfo): string[] => {
    const steps: string[] = [];

    switch (error.type) {
      case 'api':
        steps.push('Verify that the API endpoint URL is correct');
        steps.push('Check if the API key is valid and has proper permissions');
        steps.push('Ensure the API service is running and accessible');
        steps.push('Review the API documentation for correct request format');
        break;
      case 'url':
        steps.push('Verify the URL format is correct (should start with http:// or https://)');
        steps.push('Check if the URL is accessible in your browser');
        steps.push('Ensure there are no typos in the URL');
        steps.push('Verify network connectivity and firewall settings');
        break;
      case 'config':
        steps.push('Check your configuration file (config.ts)');
        steps.push('Verify environment variables are set correctly');
        steps.push('Ensure all required configuration values are provided');
        if (error.message.includes('n8n webhook')) {
          steps.push('Set VITE_N8N_WEBHOOK_URL in .env.local or update config.ts');
        }
        if (error.message.includes('Ivanti base URL')) {
          steps.push('Set the Ivanti base URL in config.ts');
        }
        break;
      case 'network':
        steps.push('Check your internet connection');
        steps.push('Verify the server is accessible');
        steps.push('Check firewall and proxy settings');
        steps.push('Try accessing the URL directly in your browser');
        break;
      case 'timeout':
        steps.push('The request took too long to complete');
        steps.push('Check your network connection speed');
        steps.push('Verify the server is responding');
        steps.push('Try again - the server may be temporarily busy');
        break;
      default:
        steps.push('Review the error details above');
        steps.push('Check your configuration and network settings');
        steps.push('Try refreshing the page');
    }

    return steps;
  };

  const hasConfigErrors = errors.some(e => e.type === 'config');
  const hasApiErrors = errors.some(e => e.type === 'api' || e.type === 'url');

  return (
    <div
      className="sit-fixed sit-inset-0 sit-z-[9999] sit-flex sit-items-center sit-justify-center sit-p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-dialog-title"
      aria-describedby="error-dialog-description"
    >
      {/* Backdrop */}
      <div
        className="sit-fixed sit-inset-0 sit-bg-black sit-bg-opacity-50 sit-backdrop-blur-sm sit-transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="sit-relative sit-bg-white sit-rounded-lg sit-shadow-xl sit-max-w-2xl sit-w-full sit-max-h-[90vh] sit-overflow-hidden sit-flex sit-flex-col sit-animate-fade-in">
        {/* Header */}
        <div className="sit-flex sit-items-center sit-justify-between sit-px-6 sit-py-4 sit-border-b sit-border-gray-200 sit-bg-gradient-to-r sit-from-red-50 sit-to-orange-50">
          <div className="sit-flex sit-items-center sit-gap-3">
            <div className="sit-flex sit-items-center sit-justify-center sit-w-10 sit-h-10 sit-rounded-full sit-bg-red-100">
              <AlertCircle className="sit-w-5 sit-h-5 sit-text-red-600" />
            </div>
            <div>
              <h2
                id="error-dialog-title"
                className="sit-text-lg sit-font-semibold sit-text-gray-900"
              >
                Configuration Errors Detected
                <br />
                <span className="sit-text-sm sit-font-normal sit-text-gray-600">
                  {errors.length} error{errors.length > 1 ? 's' : ''} found
                </span>
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="sit-p-2 sit-rounded-lg sit-text-gray-400 hover:sit-text-gray-600 hover:sit-bg-gray-100 sit-transition-colors sit-focus:outline-none sit-focus:ring-2 sit-focus:ring-red-500 sit-focus:ring-offset-2"
            aria-label="Close dialog"
          >
            <X className="sit-w-5 sit-h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="sit-flex-1 sit-overflow-y-auto sit-p-6 sit-space-y-4">
          <p id="error-dialog-description" className="sit-text-sm sit-text-gray-600 sit-mb-4">
            Please review the errors below and follow the suggested steps to resolve them.
          </p>
          <br />

          {/* Error List */}
          <div className="sit-space-y-4">
            {errors.map((error, index) => (
              <div
                key={index}
                className="sit-transition-all"
              >
                <div className="sit-flex sit-items-start sit-gap-3">
                  <div className="sit-flex-shrink-0 sit-mt-0.5">
                    {getErrorIcon(error.type)}
                  </div>
                  <div className="sit-flex-1 sit-min-w-0">
                    <br />
                    <div className="sit-flex sit-items-center sit-gap-2 sit-mb-2">
                      <h3 className="sit-font-semibold sit-text-base">
                        {getErrorTitle(error.type)}
                      </h3>
                      {error.code && (
                        <span className="sit-px-2 sit-py-0.5 sit-text-xs sit-font-mono sit-bg-white sit-bg-opacity-50 sit-rounded sit-text-gray-600">
                          {error.code}
                        </span>
                      )}
                    </div>
                    <br />
                    <p className="sit-text-sm sit-font-medium sit-mb-2">{error.message}</p>
                    {error.details && (
                      <>
                        <br />
                        <p className="sit-text-xs sit-opacity-80 sit-mb-3">
                          {error.details.split('\n').map((line, idx, arr) => (
                            <React.Fragment key={idx}>
                              {line}
                              {idx < arr.length - 1 && <br />}
                            </React.Fragment>
                          ))}
                        </p>
                      </>
                    )}

                    {/* Next Steps */}
                    <div className="sit-mt-3 sit-pt-3 sit-border-t sit-border-opacity-30">
                      <br />
                      <p className="sit-text-xs sit-font-semibold sit-mb-2 sit-uppercase sit-tracking-wide sit-opacity-70">
                        What to do next:
                      </p>
                      <ul className="sit-space-y-1.5">
                        {getNextSteps(error).map((step, stepIndex) => (
                          <li
                            key={stepIndex}
                            className="sit-flex sit-items-start sit-gap-2 sit-text-xs"
                          >
                            <CheckCircle2 className="sit-w-3 sit-h-3 sit-mt-0.5 sit-flex-shrink-0 sit-opacity-60" />
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <br />

          {/* Helpful Links */}
          <div className="sit-mt-6 sit-pt-4 sit-border-t sit-border-gray-200">
            <br />
            <p className="sit-text-xs sit-font-semibold sit-text-gray-700 sit-mb-2">
              Need more help?
            </p>
            <div className="sit-flex sit-flex-wrap sit-gap-2">
              {hasConfigErrors && onOpenSettings && (
                <button
                  onClick={() => {
                    onOpenSettings();
                    onClose();
                  }}
                  className="sit-inline-flex sit-items-center sit-gap-1.5 sit-px-3 sit-py-1.5 sit-text-xs sit-font-medium sit-text-blue-700 sit-bg-blue-50 hover:sit-bg-blue-100 sit-rounded-md sit-transition-colors sit-focus:outline-none sit-focus:ring-2 sit-focus:ring-blue-500"
                >
                  <Settings className="sit-w-3 sit-h-3" />
                  Open Settings
                </button>
              )}
              <button
                onClick={() => window.open('https://docs.n8n.io', '_blank')}
                className="sit-inline-flex sit-items-center sit-gap-1.5 sit-px-3 sit-py-1.5 sit-text-xs sit-font-medium sit-text-gray-700 sit-bg-gray-50 hover:sit-bg-gray-100 sit-rounded-md sit-transition-colors sit-focus:outline-none sit-focus:ring-2 sit-focus:ring-gray-500"
              >
                <ExternalLink className="sit-w-3 sit-h-3" />
                View Documentation
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sit-flex sit-items-center sit-justify-between sit-px-6 sit-py-4 sit-border-t sit-border-gray-200 sit-bg-gray-50">
          <button
            onClick={onClose}
            className="sit-px-4 sit-py-2 sit-text-sm sit-font-medium sit-text-gray-700 sit-bg-white sit-border sit-border-gray-300 sit-rounded-lg hover:sit-bg-gray-50 sit-transition-colors sit-focus:outline-none sit-focus:ring-2 sit-focus:ring-gray-500 sit-focus:ring-offset-2"
          >
            Dismiss
          </button>
          <div className="sit-flex sit-gap-2">
            {onRetry && hasApiErrors && (
              <button
                onClick={() => {
                  onRetry();
                  onClose();
                }}
                className="sit-inline-flex sit-items-center sit-gap-2 sit-px-4 sit-py-2 sit-text-sm sit-font-medium sit-text-white sit-bg-blue-600 sit-rounded-lg hover:sit-bg-blue-700 sit-transition-colors sit-focus:outline-none sit-focus:ring-2 sit-focus:ring-blue-500 sit-focus:ring-offset-2"
              >
                <RefreshCw className="sit-w-4 sit-h-4" />
                Retry
              </button>
            )}
            {onOpenSettings && hasConfigErrors && (
              <button
                onClick={() => {
                  onOpenSettings();
                  onClose();
                }}
                className="sit-inline-flex sit-items-center sit-gap-2 sit-px-4 sit-py-2 sit-text-sm sit-font-medium sit-text-white sit-bg-gray-900 sit-rounded-lg hover:sit-bg-gray-800 sit-transition-colors sit-focus:outline-none sit-focus:ring-2 sit-focus:ring-gray-500 sit-focus:ring-offset-2"
              >
                <Settings className="sit-w-4 sit-h-4" />
                Fix Configuration
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ErrorDialog;

