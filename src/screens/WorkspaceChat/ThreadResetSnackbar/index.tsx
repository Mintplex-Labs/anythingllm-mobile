import { useEffect } from "react";
import { useState } from "react";
import { Portal, Snackbar } from "react-native-paper";
import { NativeEventEmitter } from "react-native";

const eventEmitter = new NativeEventEmitter();
export default function ThreadResetAlert() {
  const [status, setStatus] = useState({
    visible: false,
    message: '',
  });

  useEffect(() => {
    eventEmitter.addListener('threadReset', () => {
      setStatus({ visible: true, message: 'Thread chat history has been reset.' });
    });
    return () => {
      eventEmitter.removeAllListeners('threadReset');
    };
  }, []);

  return (
    <Portal>
      <Snackbar
        visible={status.visible}
        onDismiss={() => setStatus({ visible: false, message: '' })}
        duration={2500}
        action={{
          label: 'Dismiss',
          onPress: () => setStatus({ visible: false, message: '' }),
        }}>
        {status.message ?? 'Action completed'}
      </Snackbar>
    </Portal>
  );
}