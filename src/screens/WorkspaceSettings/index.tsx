import useRedirect from "@/hooks/useRedirect";
import useChatInfoEmit from "@/hooks/useChatInfoEmit";
import useWorkspace from "@/hooks/useWorkspace";
import { useEffect, useState } from "react";
import { NativeEventEmitter } from "react-native";
import Workspace from "@/database/models/Workspace";
import { useTranslation } from "react-i18next";
import { tKey } from "@/i18n";

import { LoadingView, ErrorView, MainView } from "./Main";
import { NumericInputView } from "./NumericInput";
import { TextInputView } from "./TextInput";
import useLLMProvider from "@/hooks/useLLMPreference";
import { isOnDeviceProviderName } from "@/utils/ToolsManager/providerGuards";

/** The input shows the default of the provider the user chats with while no explicit cap is set */
function MaxToolCallsView(props: any) {
  const { llmPreferences } = useLLMProvider();
  const providerDefault = isOnDeviceProviderName(llmPreferences?.provider)
    ? Workspace.defaultMaxToolCalls.onDevice
    : Workspace.defaultMaxToolCalls.cloud;
  return (
    <NumericInputView
      {...props}
      field="maxToolCalls"
      title={tKey('workspace_settings.max_tool_calls.title')}
      currentLabel={tKey('workspace_settings.max_tool_calls.current')}
      suggestionsLabel={tKey('workspace_settings.max_tool_calls.suggested')}
      placeholder={tKey('workspace_settings.max_tool_calls.placeholder')}
      saveErrorMessage={tKey('workspace_settings.max_tool_calls.save_error')}
      resetValue={null}
      emptyValue={0}
      nullDisplayValue={providerDefault}
      hint={tKey('workspace_settings.max_tool_calls.hint')}
      hintParams={{ cloud: Workspace.defaultMaxToolCalls.cloud, onDevice: Workspace.defaultMaxToolCalls.onDevice }}
      suggestions={[5, 10, 25, 50]}
    />
  );
}

// title/placeholder/hint/label props are translation keys - the input views resolve them with t()
const PAGES = {
  main: (props: any) => <MainView {...props} />,
  system_prompt: (props: any) => (
    <TextInputView
      {...props}
      multiLine={true}
      field="systemPrompt"
      title={tKey('workspace_settings.system_prompt.title')}
      currentLabel={tKey('workspace_settings.system_prompt.current')}
      placeholder={tKey('workspace_settings.system_prompt.placeholder')}
      saveErrorMessage={tKey('workspace_settings.system_prompt.save_error')}
      resetValue={Workspace.defaultSystemPrompt}
    />
  ),
  name: (props: any) => (
    <TextInputView
      {...props}
      field="name"
      title={tKey('workspace_settings.name.title')}
      currentLabel={tKey('workspace_settings.name.current')}
      placeholder={tKey('workspace_settings.name.placeholder')}
      saveErrorMessage={tKey('workspace_settings.name.save_error')}
      resetValue={Workspace.defaultName}
    />
  ),
  temperature: (props: any) => (
    <NumericInputView
      {...props}
      field="temperature"
      title={tKey('workspace_settings.temperature.title')}
      currentLabel={tKey('workspace_settings.temperature.current')}
      suggestionsLabel={tKey('workspace_settings.temperature.suggested')}
      placeholder={tKey('workspace_settings.temperature.placeholder')}
      saveErrorMessage={tKey('workspace_settings.temperature.save_error')}
      resetValue={Workspace.defaultTemperature}
      hint={tKey('workspace_settings.temperature.hint')}
      reattachProviderOnSave={true}
    />
  ),
  context_length: (props: any) => (
    <NumericInputView
      {...props}
      field="contextLength"
      title={tKey('workspace_settings.context_length.title')}
      currentLabel={tKey('workspace_settings.context_length.current')}
      suggestionsLabel={tKey('workspace_settings.context_length.suggested')}
      placeholder={tKey('workspace_settings.context_length.placeholder')}
      saveErrorMessage={tKey('workspace_settings.context_length.save_error')}
      resetValue={Workspace.defaultContextLength}
      hint={tKey('workspace_settings.context_length.hint')}
      reattachProviderOnSave={true}
      suggestions={[512, 1024, 2048, 4096, 8192]}
    />
  ),
  max_tool_calls: (props: any) => <MaxToolCallsView {...props} />,
};
export type IWorkspacePageKey = keyof typeof PAGES;

// Local event emitter for Settings page navigation
const eventEmitter = new NativeEventEmitter();
export default function WorkspaceSettings() {
  const { t } = useTranslation();
  useRedirect();
  const { wsSlug, threadSlug } = useChatInfoEmit();
  const { loadingWorkspace, workspace, error: errorWorkspace } = useWorkspace(wsSlug);
  const [page, setPage] = useState<keyof typeof PAGES>('main');

  function navigateToPage(page: keyof typeof PAGES) {
    eventEmitter.emit('setWorkspaceSettingsPage', { page });
  }

  useEffect(() => {
    eventEmitter.addListener('setWorkspaceSettingsPage', (event) => {
      if (!(event.page in PAGES)) throw new Error(`Invalid page: ${event.page}`);
      setPage(event.page as keyof typeof PAGES);
    });
    return () => eventEmitter.removeAllListeners('setWorkspaceSettingsPage');
  }, []);

  if (loadingWorkspace) return <LoadingView />;
  if (errorWorkspace) return <ErrorView title={t('workspace_settings.load_error')} error={errorWorkspace} />;
  const Page = PAGES[page as keyof typeof PAGES];
  return <Page goToPage={navigateToPage} workspace={workspace} initialThreadSlug={threadSlug} />;
}

