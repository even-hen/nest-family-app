import { Alert, Platform, AlertButton, AlertOptions } from 'react-native';

export class AppAlert {
  static alert(
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions
  ): void {
    if (Platform.OS === 'web') {
      const displayMsg = message ? `${title}: ${message}` : title;
      
      if (buttons && buttons.length > 0) {
        // If we have buttons, let's see if we should show a confirm dialog
        const hasCancel = buttons.some(btn => btn.style === 'cancel');
        const confirmAction = buttons.find(btn => btn.style !== 'cancel');
        const cancelAction = buttons.find(btn => btn.style === 'cancel');

        if (hasCancel || buttons.length > 1) {
          const confirmed = window.confirm(displayMsg);
          if (confirmed) {
            if (confirmAction && confirmAction.onPress) {
              confirmAction.onPress();
            }
          } else {
            if (cancelAction && cancelAction.onPress) {
              cancelAction.onPress();
            }
          }
        } else {
          // Just a single button, so acts like an alert
          window.alert(displayMsg);
          if (buttons[0].onPress) {
            buttons[0].onPress();
          }
        }
      } else {
        window.alert(displayMsg);
      }
    } else {
      Alert.alert(title, message, buttons, options);
    }
  }
}
