// "View on explorer": opens a transaction or address page in the browser.
// Renders nothing without a URL: the build's chain may have no explorer
// (the local Arbitrum fork), so callers pass what transactionUrl or
// addressUrl (src/wallet/explorers.ts) returned, undefined included.
import { Linking, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from './Button';

export type ExplorerButtonProps = {
  url: string | undefined;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ExplorerButton({ url, compact, style }: ExplorerButtonProps) {
  if (!url) return null;
  return <Button label="View on explorer" variant="secondary" compact={compact} onPress={() => void Linking.openURL(url)} style={style} />;
}
