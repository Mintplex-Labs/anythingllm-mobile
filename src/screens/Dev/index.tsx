import {
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import DatabaseInspectorView from './views/DatabaseInspectorView';
import LLMManagerView from './views/LLMManagerView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function DevToolsMenu() {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'black' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 30,
          }}>
          <DatabaseInspectorView />
          <LLMManagerView />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
