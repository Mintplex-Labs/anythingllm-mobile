import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DeviceInfo from 'react-native-device-info';
import Clipboard from '@react-native-clipboard/clipboard';
import { CaretDown, CaretRight, Copy, GithubLogo, House, WarningCircle } from 'phosphor-react-native';
import telemetry from '@/utils/Telemetry';
import { PATHS } from '@/utils/paths';
import { showToast } from '@/utils/Notification';

export type ErrorFallbackProps = { error: Error; reset: () => void };

interface ErrorBoundaryProps {
  /** Identifies the boundary in crash reports, eg. "root" or "chat-message" */
  name: string;
  fallback: (props: ErrorFallbackProps) => ReactNode;
  /** Called when the fallback resets the boundary, before the children are rendered again */
  onReset?: () => void;
  children: ReactNode;
}

/**
 * Catches errors thrown while rendering its children and shows `fallback` instead of letting
 * the error crash the app. Caught errors never reach Crashlytics' global handler, so they are
 * reported here as non-fatals (when telemetry is on).
 *
 * Does not catch errors from event handlers, timers or promises - those still crash the app
 * and are reported by Crashlytics directly.
 *
 * In dev builds the error is re-thrown so React Native's red screen shows the full error.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    telemetry.recordError(error, `[ErrorBoundary:${this.props.name}] component stack:${info.componentStack ?? ''}`);
  }

  reset = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (__DEV__) throw error;
    return this.props.fallback({ error, reset: this.reset });
  }
}

/** The error, its stack and app/device info - what a bug report needs to be traced. */
function errorDetails(error: Error, stackLines = 40) {
  const header = `${error.name}: ${error.message}`;
  // Hermes stacks already start with the "Name: message" line - don't print it twice.
  const stack = (error.stack ?? '').split('\n').filter((line, i) => !(i === 0 && line === header));
  return [
    header,
    stack.slice(0, stackLines).join('\n'),
    '',
    `App version: ${DeviceInfo.getVersion()} (${DeviceInfo.getBuildNumber()})`,
    `OS: ${Platform.OS} ${Platform.Version}`,
    `Device: ${DeviceInfo.getBrand()} ${DeviceInfo.getModel()}`,
  ].join('\n');
}

/** A pre-filled GitHub issue for users who have telemetry off, so the report still reaches us. */
function githubIssueUrl(error: Error) {
  const body = [
    '**What were you doing when this happened?**',
    '',
    '<!-- Describe what you tapped or did right before the error screen appeared -->',
    '',
    '**Error**',
    '```',
    // Fewer stack lines than the copy button - GitHub rejects very long prefilled URLs.
    errorDetails(error, 15),
    '```',
  ].join('\n');
  const title = `[Crash] ${error.message}`.slice(0, 120);
  return `${PATHS.github_new_issue}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

/** Whether anonymous telemetry is on. null until the stored setting is read, so we never show the wrong message. */
function useTelemetryEnabled() {
  const [telemetryEnabled, setTelemetryEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    telemetry.isEnabled().then(setTelemetryEnabled).catch(() => setTelemetryEnabled(false));
  }, []);
  return telemetryEnabled;
}

/** Scrollable, copyable error trace. Shown only when telemetry is off - otherwise the report already reached us. */
function ErrorDetailsBox({ error }: { error: Error }) {
  return (
    <View className="bg-[--hex-gray-10] border border-white/10 rounded-xl">
      <View className="flex-row items-center justify-between px-3 pt-2">
        <Text className="text-[--hex-gray-4] text-xs font-semibold">Error details</Text>
        <TouchableOpacity
          onPress={() => {
            Clipboard.setString(errorDetails(error));
            showToast('Error details copied', 'short');
          }}
          hitSlop={8}
          className="flex-row items-center gap-x-1 py-1">
          <Copy size={14} color="#FFF" />
          <Text className="text-[--primary-text] text-xs font-semibold">Copy</Text>
        </TouchableOpacity>
      </View>
      {/* nestedScrollEnabled: the box can sit inside the chat list, which also scrolls vertically */}
      <ScrollView nestedScrollEnabled className="max-h-[160px]" contentContainerClassName="px-3 pb-3 pt-1">
        <Text selectable className="text-[--hex-gray-4] text-xs font-mono">
          {errorDetails(error)}
        </Text>
      </ScrollView>
    </View>
  );
}

function ReportOnGitHubButton({ error }: { error: Error }) {
  return (
    <TouchableOpacity
      onPress={() => Linking.openURL(githubIssueUrl(error))}
      className="flex-row items-center justify-center gap-x-2 bg-[--bg-white-5] border border-white/10 rounded-xl py-3">
      <GithubLogo size={18} color="#FFF" />
      <Text className="text-[--primary-text] text-base font-semibold">Report on GitHub</Text>
    </TouchableOpacity>
  );
}

/** Full-screen fallback for the root boundary - the whole app failed to render. */
export function RootErrorFallback({ error, reset }: ErrorFallbackProps) {
  const telemetryEnabled = useTelemetryEnabled();

  return (
    <SafeAreaView className="flex-1 bg-[--primary-bg]" edges={['top', 'bottom']}>
      <View className="flex-1 justify-center px-6 gap-y-6">
        <View className="items-center gap-y-3">
          <WarningCircle size={48} color="#F97066" />
          <Text className="text-[--primary-text] text-xl font-semibold text-center">
            Something went wrong
          </Text>
          {telemetryEnabled !== null && (
            <Text className="text-[--hex-gray-4] text-base text-center">
              {telemetryEnabled
                ? 'This error was reported to Mintplex Labs automatically.'
                : 'You have telemetry disabled, so we did not auto-report this error to Mintplex Labs, you should open a GitHub issue instead.'}
            </Text>
          )}
        </View>

        {telemetryEnabled === false && <ErrorDetailsBox error={error} />}

        <View className="gap-y-3">
          <TouchableOpacity
            onPress={reset}
            className="flex-row items-center justify-center gap-x-2 bg-[--cta-blue] rounded-xl py-3">
            <House size={18} color="#000" weight="bold" />
            <Text className="text-black text-base font-semibold">Go Home</Text>
          </TouchableOpacity>
          {telemetryEnabled === false && <ReportOnGitHubButton error={error} />}
        </View>
      </View>
    </SafeAreaView>
  );
}

/** Inline fallback for a single chat row, so one bad message does not take down the thread. */
export function MessageErrorFallback({ error }: { error: Error }) {
  const telemetryEnabled = useTelemetryEnabled();
  const [expanded, setExpanded] = useState(false);
  const Caret = expanded ? CaretDown : CaretRight;

  return (
    <View className="w-full bg-[--bg-white-5] border border-white/10 rounded-xl px-4 py-3 gap-y-2">
      <View className="flex-row items-center gap-x-2">
        <WarningCircle size={16} color="#F97066" />
        <Text className="flex-1 text-[--hex-gray-4] text-sm">
          This message could not be displayed due to an error.
        </Text>
      </View>

      {telemetryEnabled === true && (
        <Text className="text-[--hex-gray-4] text-xs opacity-70">
          This error was reported to Mintplex Labs automatically.
        </Text>
      )}

      {telemetryEnabled === false && (
        <>
          <TouchableOpacity
            onPress={() => setExpanded((open) => !open)}
            hitSlop={8}
            className="flex-row items-center gap-x-1">
            <Caret size={12} color="#9F9FA0" />
            <Text className="text-[--hex-gray-4] text-xs font-semibold">
              {expanded ? 'Hide error details' : 'Show error details'}
            </Text>
          </TouchableOpacity>
          {expanded && (
            <View className="gap-y-3">
              <Text className="text-[--hex-gray-4] text-xs">
                You have telemetry disabled, so we did not auto-report this error to Mintplex Labs, you should open a GitHub issue instead.
              </Text>
              <ErrorDetailsBox error={error} />
              <ReportOnGitHubButton error={error} />
            </View>
          )}
        </>
      )}
    </View>
  );
}
