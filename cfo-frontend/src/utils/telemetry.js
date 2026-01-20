/**
 * Telemetry Helper - AI Chat Event Tracking
 * 
 * Events tracked:
 * - ai_chat_opened: Panel opened
 * - ai_chat_closed: Panel closed
 * - ai_query_submitted: User sent query
 * - ai_response_received: AI response received
 * - ai_error: Error occurred
 * - ai_message_copied: User copied message
 * - ai_template_used: User clicked template question
 */

/**
 * Send telemetry event
 * @param {string} eventName - Name of the event
 * @param {object} payload - Event data
 */
export const sendTelemetry = (eventName, payload = {}) => {
  const event = {
    event: eventName,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  // TODO: Replace with actual analytics service (e.g., Amplitude, Mixpanel, GA)
  console.log('[Telemetry]', event);

  // Example integration with a hypothetical analytics service:
  // if (window.analytics) {
  //   window.analytics.track(eventName, payload);
  // }
};

/**
 * Track AI chat opened
 */
export const trackChatOpened = () => {
  sendTelemetry('ai_chat_opened', {
    source: 'navbar_button',
  });
};

/**
 * Track AI chat closed
 * @param {number} duration - How long the panel was open (ms)
 * @param {number} messageCount - Number of messages in conversation
 */
export const trackChatClosed = (duration, messageCount) => {
  sendTelemetry('ai_chat_closed', {
    duration_ms: duration,
    message_count: messageCount,
  });
};

/**
 * Track query submitted
 * @param {string} query - User's query text
 * @param {boolean} isTemplate - Whether it was a template question
 */
export const trackQuerySubmitted = (query, isTemplate = false) => {
  sendTelemetry('ai_query_submitted', {
    query_length: query.length,
    is_template: isTemplate,
  });
};

/**
 * Track AI response received
 * @param {number} duration - Response time (ms)
 * @param {number} responseLength - Length of AI response
 */
export const trackResponseReceived = (duration, responseLength) => {
  sendTelemetry('ai_response_received', {
    response_time_ms: duration,
    response_length: responseLength,
  });
};

/**
 * Track error occurred
 * @param {string} errorType - Type of error (network, auth, server, etc.)
 * @param {string} errorMessage - Error message
 */
export const trackError = (errorType, errorMessage) => {
  sendTelemetry('ai_error', {
    error_type: errorType,
    error_message: errorMessage,
  });
};

/**
 * Track message copied
 * @param {string} role - Message role (user or assistant)
 */
export const trackMessageCopied = (role) => {
  sendTelemetry('ai_message_copied', {
    message_role: role,
  });
};

/**
 * Track template question used
 * @param {number} templateIndex - Index of template (0-4)
 */
export const trackTemplateUsed = (templateIndex) => {
  sendTelemetry('ai_template_used', {
    template_index: templateIndex,
  });
};
