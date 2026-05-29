import { ActionSheetIOS, Alert, Platform } from 'react-native'

interface MessageDeletePrompt {
  title: string
  message: string
  cancelText: string
  deleteText: string
  onDelete: () => void | Promise<void>
}

export function confirmMessageDelete({
  title,
  message,
  cancelText,
  deleteText,
  onDelete,
}: MessageDeletePrompt) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options: [deleteText, cancelText],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
      },
      buttonIndex => {
        if (buttonIndex === 0) void onDelete()
      },
    )
    return
  }

  Alert.alert(title, message, [
    { text: cancelText, style: 'cancel' },
    { text: deleteText, style: 'destructive', onPress: () => void onDelete() },
  ])
}
