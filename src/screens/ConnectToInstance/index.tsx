import useRedirect from "@/hooks/useRedirect";
import { useEffect, useState } from "react";
import { useRoute } from "@react-navigation/native";
import uiStore from "@/store/UIStore";

import { MainView } from "./Main";
import { VerifyView } from "./Verify";
import { ImportView } from "./Import";

const PAGES = {
  start: (props: any) => <MainView {...props} />,
  verify: (props: any) => <VerifyView {...props} />,
  import: (props: any) => <ImportView {...props} />,
};
export type IWorkspacePageKey = keyof typeof PAGES;

export default function ConnectToInstance() {
  useRedirect();
  const route = useRoute();
  const [page, setPage] = useState<{ key: IWorkspacePageKey, params: object }>({ key: 'start', params: {} });

  useEffect(() => {
    async function getPage() {
      const externalConnection = await uiStore.getFromStorage('anythingllm_external_connection', null) as { token: string, connectionUrl: string } | null;
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