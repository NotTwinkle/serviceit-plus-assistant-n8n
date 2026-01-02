/**
 * SetupWizard Component
 * 
 * First-time setup wizard for configuring Ivanti instance URL and API path.
 * Tests endpoints to verify configuration before saving.
 */

import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Loader2, AlertCircle, Lock, Globe, Settings, ArrowRight, X, Minimize2, Eye, EyeOff, Key } from 'lucide-react';

export interface SetupConfig {
  baseUrl: string;
  apiPathPrefix: string;
  apiKey?: string;
}

interface SetupWizardProps {
  open: boolean;
  onComplete: (config: SetupConfig) => void;
  onSkip?: () => void;
  onClose?: () => void;
}

interface TestResult {
  endpoint: string;
  status: number;
  success: boolean;
  error?: string;
}

const SetupWizard: React.FC<SetupWizardProps> = ({ open, onComplete, onSkip, onClose }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiPathPrefix, setApiPathPrefix] = useState('/HEAT/api');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Auto-detect current URL
  useEffect(() => {
    if (open && step === 1 && !baseUrl) {
      const currentUrl = window.location.origin;
      setBaseUrl(currentUrl);
    }
  }, [open, step, baseUrl]);

  const validateUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const testEndpoints = async (): Promise<TestResult[]> => {
    const results: TestResult[] = [];
    
    // Test endpoints to verify API path
    // OData endpoints are required - REST endpoints are optional
    const endpointsToTest = [
      { path: 'odata/businessobject/employees?$top=1', required: true, name: 'Employees (OData)' },
      { path: 'odata/businessobject/categorys?$top=1', required: true, name: 'Categories (OData)' },
      { path: 'odata/businessobject/FRS_Knowledges?$top=1', required: false, name: 'Knowledge Base (OData)' },
      { path: 'v1/User/current', required: false, name: 'User Current (REST v1)' },
      { path: 'v1/user/current', required: false, name: 'User Current (REST v1 lowercase)' },
    ];

    // Build headers with API key if provided
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    // Add API key authentication if provided
    if (apiKey && apiKey.trim()) {
      headers['Authorization'] = `rest_api_key=${apiKey.trim()}`;
    }

    for (const endpoint of endpointsToTest) {
      try {
        const testUrl = `${baseUrl}${apiPathPrefix}/${endpoint.path}`;
        const response = await fetch(testUrl, {
          method: 'GET',
          credentials: 'include',
          headers,
        });

        const status = response.status;
        // For required endpoints: success = 200/204/401/403 (endpoint exists)
        // For optional endpoints: 404 is acceptable (endpoint doesn't exist on this instance)
        const success = endpoint.required 
          ? (status === 200 || status === 204 || status === 401 || status === 403)
          : (status === 200 || status === 204 || status === 401 || status === 403 || status === 404);
        
        results.push({
          endpoint: `${apiPathPrefix}/${endpoint.path} (${endpoint.name})`,
          status,
          success,
          error: success ? undefined : `HTTP ${status}`,
        });
      } catch (error: any) {
        results.push({
          endpoint: `${apiPathPrefix}/${endpoint.path} (${endpoint.name})`,
          status: 0,
          success: false,
          error: error.message || 'Network error',
        });
      }
    }

    return results;
  };

  const handleTest = async () => {
    if (!validateUrl(baseUrl)) {
      setErrors(['Please enter a valid URL (must start with http:// or https://)']);
      return;
    }

    if (!apiKey || !apiKey.trim()) {
      setErrors([
        'API Key is required for authentication.',
        'Please enter your Ivanti REST API key to test the connection.',
      ]);
      return;
    }

    setIsTesting(true);
    setErrors([]);
    setTestResults([]);

    try {
      const results = await testEndpoints();
      setTestResults(results);

      // Define endpoints structure for checking required vs optional
      const endpointsToTest = [
        { path: 'odata/businessobject/employees?$top=1', required: true },
        { path: 'odata/businessobject/categorys?$top=1', required: true },
        { path: 'odata/businessobject/FRS_Knowledges?$top=1', required: false },
        { path: 'v1/User/current', required: false },
        { path: 'v1/user/current', required: false },
      ];

      // Check required endpoints (OData endpoints)
      const requiredEndpoints = results.filter((_, idx) => {
        const endpoint = endpointsToTest[idx];
        return endpoint?.required === true;
      });
      const requiredSuccessCount = requiredEndpoints.filter(r => r.success).length;
      const totalSuccessCount = results.filter(r => r.success).length;
      
      if (requiredSuccessCount === 0) {
        // No required endpoints worked
        setErrors([
          'Required endpoints failed. Please check:',
          '• Is the URL correct?',
          '• Is the API path prefix correct?',
          '• Is the API key valid?',
          '• Are you logged in to Ivanti?',
          '• Check browser console for detailed errors',
        ]);
      } else if (requiredSuccessCount < requiredEndpoints.length) {
        // Some required endpoints failed
        setErrors([
          `Some required endpoints failed (${requiredSuccessCount}/${requiredEndpoints.length} succeeded).`,
          'Please verify your API path prefix and API key.',
        ]);
      } else {
        // All required endpoints passed - configuration is valid!
        // Optional endpoints may have failed (404), but that's okay
        if (totalSuccessCount < results.length) {
          // Some optional endpoints failed, but that's fine
          setErrors([
            `✅ Configuration verified! (${totalSuccessCount}/${results.length} endpoints succeeded)`,
            'Some optional endpoints are not available on this instance, which is normal.',
          ]);
        }
        // Move to success step
        setStep(3);
      }
    } catch (error: any) {
      setErrors([error.message || 'Failed to test endpoints']);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save configuration securely
      await chrome.storage.local.set({
        'ivanti_config': {
          baseUrl,
          apiPathPrefix,
          apiKey: apiKey.trim(),
          configuredAt: Date.now(),
        },
      });

      // Also update sessionStorage for immediate use
      sessionStorage.setItem('serviceit_api_path_prefix', JSON.stringify({
        prefix: apiPathPrefix,
        timestamp: Date.now(),
      }));

      onComplete({ baseUrl, apiPathPrefix });
    } catch (error: any) {
      setErrors([`Failed to save configuration: ${error.message}`]);
    } finally {
      setIsSaving(false);
    }
  };

  const commonApiPaths = [
    { value: '/HEAT/api', label: '/HEAT/api (Most common)' },
    { value: '/api', label: '/api (Direct API)' },
    { value: '/ServiceManager/api', label: '/ServiceManager/api' },
    { value: '/ISM/api', label: '/ISM/api' },
    { value: '/Ivanti/api', label: '/Ivanti/api' },
    { value: '/HEAT/rest', label: '/HEAT/rest (Legacy)' },
    { value: '/rest', label: '/rest' },
  ];

  if (!open) return null;

  // Minimized state - show floating button
  if (isMinimized) {
    return (
      <div className="sit-fixed sit-bottom-4 sit-right-4 sit-z-[9999]">
        <button
          onClick={() => setIsMinimized(false)}
          className="sit-flex sit-items-center sit-gap-2 sit-px-4 sit-py-3 sit-bg-blue-600 sit-text-white sit-rounded-lg sit-shadow-lg hover:sit-bg-blue-700 sit-transition-colors sit-border-2 sit-border-white"
          title="Click to restore setup wizard"
        >
          <Settings className="sit-w-5 sit-h-5" />
          <span className="sit-text-sm sit-font-medium">Setup Required</span>
        </button>
      </div>
    );
  }

  return (
    <div className="sit-fixed sit-inset-0 sit-z-[9999] sit-flex sit-items-center sit-justify-center sit-p-4 sit-bg-black sit-bg-opacity-60 sit-backdrop-blur-sm">
      <div className="sit-bg-white sit-rounded-lg sit-shadow-2xl sit-max-w-2xl sit-w-full sit-max-h-[90vh] sit-overflow-hidden sit-flex sit-flex-col sit-border-2 sit-border-gray-200">
        {/* Header */}
        <div className="sit-flex sit-items-center sit-justify-between sit-px-6 sit-py-4 sit-border-b sit-border-gray-300 sit-bg-gradient-to-r sit-from-blue-50 sit-to-indigo-50">
          <div className="sit-flex sit-items-center sit-gap-3">
            <div className="sit-flex sit-items-center sit-justify-center sit-w-10 sit-h-10 sit-rounded-full sit-bg-blue-100 sit-border-2 sit-border-blue-200">
              <Settings className="sit-w-5 sit-h-5 sit-text-blue-600" />
            </div>
            <div>
              <h2 className="sit-text-lg sit-font-semibold sit-text-gray-900">
                Welcome to ServiceIT AI Assistant
              </h2>
              <br />
              <p className="sit-text-sm sit-text-gray-600">
                Let's configure your Ivanti instance
              </p>
            </div>
          </div>
          <div className="sit-flex sit-items-center sit-gap-2">
            <button
              onClick={() => setIsMinimized(true)}
              className="sit-p-2 sit-text-gray-500 hover:sit-text-gray-700 hover:sit-bg-gray-100 sit-rounded-md sit-transition-colors"
              title="Minimize"
            >
              <Minimize2 className="sit-w-4 sit-h-4" />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="sit-p-2 sit-text-gray-500 hover:sit-text-gray-700 hover:sit-bg-gray-100 sit-rounded-md sit-transition-colors"
                title="Close"
              >
                <X className="sit-w-4 sit-h-4" />
              </button>
            )}
            {!onClose && onSkip && (
              <button
                onClick={onSkip}
                className="sit-px-3 sit-py-1.5 sit-text-sm sit-text-gray-600 hover:sit-text-gray-800 hover:sit-bg-gray-100 sit-rounded-md sit-transition-colors"
              >
                Skip
              </button>
            )}
          </div>
        </div>

        {/* Progress Steps */}
        <div className="sit-px-6 sit-py-4 sit-border-b sit-border-gray-200 sit-bg-gray-50">
          <div className="sit-flex sit-items-center sit-justify-center sit-gap-4">
            {[1, 2, 3].map((s) => (
              <React.Fragment key={s}>
                <div className="sit-flex sit-items-center sit-gap-2">
                  <div
                    className={`sit-w-8 sit-h-8 sit-rounded-full sit-flex sit-items-center sit-justify-center sit-font-semibold sit-text-sm sit-transition-colors ${
                      step >= s
                        ? 'sit-bg-blue-600 sit-text-white'
                        : 'sit-bg-gray-200 sit-text-gray-500'
                    }`}
                  >
                    {step > s ? <CheckCircle2 className="sit-w-5 sit-h-5" /> : s}
                  </div>
                  <span className="sit-text-xs sit-text-gray-600 sit-hidden sm:sit-inline">
                    {s === 1 ? 'URL' : s === 2 ? 'Test' : 'Save'}
                  </span>
                </div>
                {s < 3 && (
                  <div
                    className={`sit-h-0.5 sit-w-12 sit-transition-colors ${
                      step > s ? 'sit-bg-blue-600' : 'sit-bg-gray-200'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="sit-flex-1 sit-overflow-y-auto sit-p-6">
          {/* Step 1: Configuration */}
          {step === 1 && (
            <div className="sit-space-y-6">
              <div>
                <h3 className="sit-text-lg sit-font-semibold sit-text-gray-900 sit-mb-2">
                  Configure Your Ivanti Instance
                </h3>
                <br />
                <p className="sit-text-sm sit-text-gray-600">
                  Enter your Ivanti instance URL and API path prefix. We'll test the connection to verify everything works.
                </p>
              </div>

              <div className="sit-space-y-6">
                <div className="sit-space-y-2">
                  <label className="sit-flex sit-items-center sit-gap-2 sit-text-sm sit-font-semibold sit-text-gray-800 sit-mb-3">
                    <Globe className="sit-w-5 sit-h-5 sit-text-blue-600" />
                    Base URL
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value.trim())}
                    placeholder="https://your-instance.serviceitplus.com"
                    className="sit-w-full sit-px-4 sit-py-3 sit-text-base sit-bg-white sit-border-2 sit-border-gray-400 sit-rounded-lg sit-shadow-sm sit-focus:outline-none sit-focus:ring-2 sit-focus:ring-blue-500 sit-focus:border-blue-500 sit-transition-all sit-placeholder-gray-400"
                    style={{ 
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                    }}
                  />
                  <p className="sit-text-xs sit-text-gray-600 sit-mt-2 sit-pl-1">
                    The base URL of your Ivanti instance (without trailing slash)
                  </p>
                </div>

                <div className="sit-space-y-2">
                  <label className="sit-flex sit-items-center sit-gap-2 sit-text-sm sit-font-semibold sit-text-gray-800 sit-mb-3">
                    <Settings className="sit-w-5 sit-h-5 sit-text-blue-600" />
                    API Path Prefix
                  </label>
                  <select
                    value={apiPathPrefix}
                    onChange={(e) => setApiPathPrefix(e.target.value)}
                    className="sit-w-full sit-px-4 sit-py-3 sit-text-base sit-bg-white sit-border-2 sit-border-gray-400 sit-rounded-lg sit-shadow-sm sit-focus:outline-none sit-focus:ring-2 sit-focus:ring-blue-500 sit-focus:border-blue-500 sit-transition-all sit-appearance-none sit-cursor-pointer"
                    style={{ 
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23333' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 1rem center',
                      paddingRight: '2.5rem',
                    }}
                  >
                    {commonApiPaths.map((path) => (
                      <option key={path.value} value={path.value}>
                        {path.label}
                      </option>
                    ))}
                  </select>
                  <p className="sit-text-xs sit-text-gray-600 sit-mt-2 sit-pl-1">
                    The API path prefix used by your Ivanti instance
                  </p>
                </div>

                <div className="sit-space-y-2">
                  <label className="sit-flex sit-items-center sit-gap-2 sit-text-sm sit-font-semibold sit-text-gray-800 sit-mb-3">
                    <Key className="sit-w-5 sit-h-5 sit-text-blue-600" />
                    API Key (Required)
                  </label>
                  <div className="sit-relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter your Ivanti REST API key"
                      className="sit-w-full sit-px-4 sit-py-3 sit-pr-12 sit-text-base sit-bg-white sit-border-2 sit-border-gray-400 sit-rounded-lg sit-shadow-sm sit-focus:outline-none sit-focus:ring-2 sit-focus:ring-blue-500 sit-focus:border-blue-500 sit-transition-all sit-placeholder-gray-400"
                      style={{ 
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="sit-absolute sit-right-3 sit-top-1/2 sit--translate-y-1/2 sit-p-1 sit-text-gray-500 hover:sit-text-gray-700 sit-transition-colors"
                      title={showApiKey ? 'Hide API key' : 'Show API key'}
                    >
                      {showApiKey ? (
                        <EyeOff className="sit-w-5 sit-h-5" />
                      ) : (
                        <Eye className="sit-w-5 sit-h-5" />
                      )}
                    </button>
                  </div>
                  <p className="sit-text-xs sit-text-gray-600 sit-mt-2 sit-pl-1">
                    Your Ivanti REST API key for authentication (format: rest_api_key=...)
                  </p>
                </div>

                <div className="sit-flex sit-items-start sit-gap-3 sit-p-4 sit-bg-blue-50 sit-rounded-lg sit-border-2 sit-border-blue-300 sit-shadow-sm">
                  <AlertCircle className="sit-w-5 sit-h-5 sit-text-blue-600 sit-flex-shrink-0 sit-mt-0.5" />
                  <div className="sit-text-sm sit-text-blue-900">
                    <p className="sit-font-semibold sit-mb-2">💡 Don't know your API path?</p>
                    <br />
                    <p className="sit-text-xs sit-leading-relaxed">
                      Try the most common option first (<code className="sit-bg-blue-200 sit-px-2 sit-py-0.5 sit-rounded sit-font-mono sit-text-blue-900">/HEAT/api</code>). 
                      We'll test it in the next step and suggest alternatives if needed.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Testing */}
          {step === 2 && (
            <div className="sit-space-y-6">
              <div>
                <h3 className="sit-text-lg sit-font-semibold sit-text-gray-900 sit-mb-2">
                  Testing Connection
                </h3>
                <p className="sit-text-sm sit-text-gray-600">
                  Verifying that your configuration works by testing API endpoints...
                </p>
              </div>

              {isTesting && (
                <div className="sit-flex sit-items-center sit-justify-center sit-py-8">
                  <Loader2 className="sit-w-8 sit-h-8 sit-animate-spin sit-text-blue-600" />
                  <span className="sit-ml-3 sit-text-gray-600">Testing endpoints...</span>
                </div>
              )}

              {testResults.length > 0 && (
                <div className="sit-space-y-2">
                  <h4 className="sit-text-sm sit-font-semibold sit-text-gray-700">Test Results:</h4>
                  {testResults.map((result, idx) => (
                    <div
                      key={idx}
                      className={`sit-flex sit-items-center sit-gap-3 sit-p-3 sit-rounded-lg sit-border ${
                        result.success
                          ? 'sit-bg-green-50 sit-border-green-200'
                          : 'sit-bg-red-50 sit-border-red-200'
                      }`}
                    >
                      {result.success ? (
                        <CheckCircle2 className="sit-w-5 sit-h-5 sit-text-green-600 sit-flex-shrink-0" />
                      ) : (
                        <XCircle className="sit-w-5 sit-h-5 sit-text-red-600 sit-flex-shrink-0" />
                      )}
                      <div className="sit-flex-1 sit-min-w-0">
                        <div className="sit-text-sm sit-font-mono sit-text-gray-800 sit-truncate">
                          {result.endpoint}
                        </div>
                        <div className="sit-text-xs sit-text-gray-600">
                          {result.success ? (
                            <span className="sit-text-green-700">✓ Success (HTTP {result.status})</span>
                          ) : (
                            <span className="sit-text-red-700">✗ Failed: {result.error}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {errors.length > 0 && (
                <div className="sit-p-4 sit-bg-red-50 sit-border sit-border-red-200 sit-rounded-lg">
                  <div className="sit-flex sit-items-start sit-gap-2">
                    <AlertCircle className="sit-w-5 sit-h-5 sit-text-red-600 sit-flex-shrink-0 sit-mt-0.5" />
                    <div className="sit-text-sm sit-text-red-800">
                      {errors.map((error, idx) => (
                        <p key={idx} className={idx > 0 ? 'sit-mt-1' : ''}>
                          {error}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Success */}
          {step === 3 && (
            <div className="sit-space-y-6 sit-text-center">
              <div className="sit-flex sit-items-center sit-justify-center sit-w-16 sit-h-16 sit-mx-auto sit-rounded-full sit-bg-green-100">
                <CheckCircle2 className="sit-w-8 sit-h-8 sit-text-green-600" />
              </div>
              <div>
                <h3 className="sit-text-lg sit-font-semibold sit-text-gray-900 sit-text-center sit-mb-2">
                  Configuration Verified! 🎉
                </h3>
                <br />
                <p className="sit-text-sm sit-text-gray-600">
                  Your Ivanti instance is configured and ready to use. Your settings will be saved securely.
                </p>
              </div>
              <div className="sit-flex sit-items-center sit-justify-center sit-gap-2 sit-p-3 sit-bg-gray-50 sit-rounded-lg">
                <Lock className="sit-w-4 sit-h-4 sit-text-gray-600" />
                <span className="sit-text-xs sit-text-gray-600">
                  Configuration will be encrypted and stored locally
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sit-flex sit-items-center sit-justify-between sit-px-6 sit-py-4 sit-border-t sit-border-gray-200 sit-bg-gray-50">
          {step > 1 && (
            <button
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
              className="sit-px-4 sit-py-2 sit-text-sm sit-font-medium sit-text-gray-700 sit-bg-white sit-border sit-border-gray-300 sit-rounded-lg hover:sit-bg-gray-50 sit-transition-colors"
            >
              Back
            </button>
          )}
          <div className="sit-flex-1" />
          {step === 1 && (
            <button
              onClick={handleTest}
              disabled={!baseUrl || !validateUrl(baseUrl) || !apiKey || !apiKey.trim()}
              className="sit-inline-flex sit-items-center sit-gap-2 sit-px-4 sit-py-2 sit-text-sm sit-font-medium sit-text-white sit-bg-blue-600 sit-rounded-lg hover:sit-bg-blue-700 sit-disabled:sit-opacity-50 sit-disabled:sit-cursor-not-allowed sit-transition-colors"
            >
              Test Connection
              <ArrowRight className="sit-w-4 sit-h-4" />
            </button>
          )}
          {step === 2 && testResults.length > 0 && (
            <button
              onClick={handleSave}
              disabled={isSaving || testResults.filter(r => r.success).length === 0}
              className="sit-inline-flex sit-items-center sit-gap-2 sit-px-4 sit-py-2 sit-text-sm sit-font-medium sit-text-white sit-bg-green-600 sit-rounded-lg hover:sit-bg-green-700 sit-disabled:sit-opacity-50 sit-disabled:sit-cursor-not-allowed sit-transition-colors"
            >
              {isSaving ? (
                <>
                  <Loader2 className="sit-w-4 sit-h-4 sit-animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Save Configuration
                  <Lock className="sit-w-4 sit-h-4" />
                </>
              )}
            </button>
          )}
          {step === 3 && (
            <button
              onClick={() => onComplete({ baseUrl, apiPathPrefix, apiKey })}
              className="sit-inline-flex sit-items-center sit-gap-2 sit-px-4 sit-py-2 sit-text-sm sit-font-medium sit-text-white sit-bg-blue-600 sit-rounded-lg hover:sit-bg-blue-700 sit-transition-colors"
            >
              Get Started
              <ArrowRight className="sit-w-4 sit-h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SetupWizard;

