import { useRef, useState } from 'react';
import SafeView from '@/components/SafeView';
import useHighjackBackButtonPress from '@/hooks/useHighjackBackButtonPress';
import { BrowserTraceView } from '@/components/BrowserUseTrace';
import { IWorkspacePageKey } from '../index';
import Home from './Home';
import ProfileDetail from './ProfileDetail';

interface BrowserUseSettingsProps {
  goToPage: (page: IWorkspacePageKey) => void;
}

type Page = { kind: 'home' } | { kind: 'profile'; profileId: string } | { kind: 'trace'; traceId: string };

/**
 * Settings > Utility > Browser use: everything the browser agent keeps on the phone - its
 * profiles (separate cookie jars), the sites each one is signed in to, and the history of every
 * session it ran. The mobile counterpart of the desktop Browser Use skill panel.
 *
 * Three pages: Home (profiles + history), ProfileDetail, and a session's steps (BrowserTraceView).
 */
export default function BrowserUseSettings({ goToPage }: BrowserUseSettingsProps) {
  const [page, setPage] = useState<Page>({ kind: 'home' });
  const goBack = () => {
    if (page.kind !== 'home') setPage({ kind: 'home' });
    else goToPage('main');
    return true;
  };
  // The hook registers once on mount - read the current sub-page through a ref.
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;
  useHighjackBackButtonPress(() => goBackRef.current());

  if (page.kind === 'trace') return <BrowserTraceView traceId={page.traceId} onBack={goBack} />;
  return (
    <SafeView scrollable={false} safeAreaClassNames="pt-[21px]" containerClassNames="flex flex-col flex-1" safeAreaStyle={{ backgroundColor: '#0E0F0F' }}>
      {page.kind === 'profile'
        ? <ProfileDetail profileId={page.profileId} onBack={goBack} />
        : <Home onBack={goBack} openProfile={(profileId) => setPage({ kind: 'profile', profileId })} openTrace={(traceId) => setPage({ kind: 'trace', traceId })} />}
    </SafeView>
  );
}
