import useRedirect from "@/hooks/useRedirect";
import { useEffect, useState } from "react";
import { useRoute } from "@react-navigation/native";
import uiStore from "@/store/UIStore";
import AnythingLLMExternal from "@/utils/AnythingLLMExternal";

import { MainView } from "./Main";
import { VerifyView } from "./Verify";
import { ImportView } from "./Import";

const PAGES = {
  start: (props: any) => <MainView {...props} />,
  verify: (props: any) => <VerifyView {...props} />,
  import: (props: any) => <ImportView {...props} />,
};
export type IWorkspacePageKey = keyof typeof PAGES;

export interface IExternalConnection {
  token: string;
  connectionUrl: string;
  platform: 'server' | 'desktop';
}

export default function ConnectToInstance() {
  useRedirect();
  const route = useRoute();
  const [page, setPage] = useState<{ key: IWorkspacePageKey, params: object }>({ key: 'start', params: {} });

  useEffect(() => {
    async function getPage() {
      const externalConnection = await uiStore.getFromStorage('current_anythingllm_external_connection', null) as IExternalConnection | null;
      if (externalConnection) {
        setPage({ key: 'import', params: { ...route?.params ?? {}, connectionUrl: externalConnection.connectionUrl, deviceToken: externalConnection.token } });
      } else {
        setPage({ key: (route?.params as any)?.page ?? 'start', params: route?.params ?? {} });
      }
    }
    getPage();
  }, [route?.params]);

  const Page = PAGES[page.key as keyof typeof PAGES];
  return <Page params={page.params} />;
}

/**
 * Unregister a connection from the AnythingLLM instance
 * - Removes the connection from the local storage + the current connection
 * - Sends a command to the AnythingLLM instance to unregister the device (blindly)
 */
export async function unregisterConnection(connection: IExternalConnection): Promise<IExternalConnection[]> {
  const connections = await uiStore.getFromStorage('anythingllm_external_connections', []) as IExternalConnection[];
  const newConnections = connections.filter((c) => c.token !== connection.token);
  await uiStore.removeFromStorage('current_anythingllm_external_connection');
  await uiStore.setToStorage('anythingllm_external_connections', newConnections);
  try { await (new AnythingLLMExternal(connection.connectionUrl, connection.token)).sendCommand('unregister-device'); } catch { }
  return newConnections;
}