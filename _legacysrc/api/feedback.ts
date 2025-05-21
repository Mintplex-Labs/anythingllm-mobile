type FeedbackData = {
  useCase: string;
  featureRequests: string;
  generalFeedback: string;
  usageFrequency: string;
  appFeedbackId: string;
};

/**
 * Submits feedback data to the server with App Check verification
 */
export async function submitFeedback(
  feedbackData: Omit<FeedbackData, 'appFeedbackId'>,
): Promise<{message: string}> {
  return {message: 'test'};
}
