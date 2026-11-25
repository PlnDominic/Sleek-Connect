import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { radii, type IconName } from '@sleek/shared';
import { AppleButton, GoogleButton } from '@/components/SocialButtons';
import { AppText } from '@/components/AppText';
import { Button, Card, Notice } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { Checkbox, useScreenTop } from '@/components/ui';
import { deleteMyAccount } from '@/lib/account';
import { useAuth } from '@/lib/auth';
import { pushAllowed, registerForPush, unregisterPush } from '@/lib/push';
import { openSite, siteConfigured } from '@/lib/site';
import { useColors, useStyles, useTheme, type Palette, type ThemeMode } from '@/theme/theme';

const siteLinks: { icon: IconName; title: string; text: string; path: string }[] = [
  { icon: 'headset', title: 'Help and contact', text: 'Delivery, returns and how to reach us', path: '/help' },
  { icon: 'lock', title: 'Privacy notice', text: 'How we use your data', path: '/privacy' },
  { icon: 'clipboard', title: 'Terms of service', text: 'The terms for shopping with us', path: '/terms' },
];

export default function AccountScreen() {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  const top = useScreenTop();
  const { user, loading } = useAuth();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: top }]} keyboardShouldPersistTaps="handled">
      <AppText weight="semibold" size={22} accessibilityRole="header">
        Account
      </AppText>

      {loading ? (
        <AppText size={14} color={colors.textMuted}>
          Loading…
        </AppText>
      ) : user ? (
        <SignedIn />
      ) : (
        <SignedOut />
      )}

      <AppearanceCard />

      <AppText weight="bold" size={12} color={colors.textMuted} style={styles.sectionLabel}>
        SHOPPING AND HELP
      </AppText>
      <View style={styles.list}>
        <LinkRow icon="box" title="Your orders" text="Track an order, or find one by its number" onPress={() => router.push('/orders')} />
        {siteLinks.map((l) => (
          <LinkRow key={l.path} icon={l.icon} title={l.title} text={l.text} onPress={() => void openSite(l.path)} disabled={!siteConfigured} />
        ))}
      </View>

      {user ? <AccountActions /> : null}
    </ScrollView>
  );
}

const appearanceOptions: { mode: ThemeMode; label: string }[] = [
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
  { mode: 'system', label: 'Auto' },
];

function AppearanceCard() {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  const { mode, setMode } = useTheme();
  return (
    <View style={styles.appearance}>
      <View style={styles.flex}>
        <AppText weight="bold" size={15}>
          Appearance
        </AppText>
        <AppText size={13} color={colors.textMuted}>
          {mode === 'system' ? 'Matches your phone' : mode === 'dark' ? 'Dark theme' : 'Light theme'}
        </AppText>
      </View>
      <View style={styles.segment} accessibilityRole="radiogroup">
        {appearanceOptions.map((o) => {
          const on = o.mode === mode;
          return (
            <Pressable
              key={o.mode}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.label}
              onPress={() => setMode(o.mode)}
              style={[styles.segmentItem, on && styles.segmentOn]}
            >
              <AppText weight={on ? 'bold' : 'semibold'} size={13} color={on ? colors.canvas : colors.textMuted}>
                {o.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SignedOut() {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  const { signInWithGoogle, appleAvailable, signInWithApple, recordConsent } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  // The buttons stay tappable: before the box is ticked they say what to do, instead of looking broken.
  const needAgreement = 'Tick the box above to accept the terms, then sign in.';

  const google = () => {
    if (!agreed) return setError(needAgreement);
    void run(async () => {
      if (await signInWithGoogle()) await recordConsent().catch(() => {});
    }, 'We couldn’t sign you in with Google. Please try again.');
  };

  const apple = () => {
    if (!agreed) return setError(needAgreement);
    void run(async () => {
      if (await signInWithApple()) await recordConsent().catch(() => {});
    }, 'We couldn’t sign you in with Apple. Please try again.');
  };

  return (
    <Card title="Sign in">
      <AppText size={13} color={colors.textMuted} style={styles.lh}>
        You can check out and track orders as a guest. Sign in to save your details and see your orders and saved items across devices.
      </AppText>
      <Checkbox checked={agreed} onChange={setAgreed} label="I accept the Terms of Service and Privacy Notice." />
      <View style={styles.inlineLinks}>
        <Pressable accessibilityRole="link" onPress={() => void openSite('/terms')}>
          <AppText size={13} weight="semibold" color={colors.accent}>
            Read the terms
          </AppText>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => void openSite('/privacy')}>
          <AppText size={13} weight="semibold" color={colors.accent}>
            Read the privacy notice
          </AppText>
        </Pressable>
      </View>
      {appleAvailable ? <AppleButton onPress={apple} disabled={busy} /> : null}
      <GoogleButton onPress={google} disabled={busy} />
      {error ? <Notice>{error}</Notice> : null}
    </Card>
  );
}

function SignedIn() {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  const { user, consented, recordConsent } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [notifying, setNotifying] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void pushAllowed().then(setNotifying);
  }, []);

  return (
    <>
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <AppText weight="bold" size={22} color={colors.canvas}>
            {(user?.email ?? user?.phone ?? 'S').replace(/^\+/, '').charAt(0).toUpperCase()}
          </AppText>
        </View>
        <View style={styles.flex}>
          <AppText weight="bold" size={16} numberOfLines={1}>
            {user?.phone ? `+${user.phone.replace(/^\+/, '')}` : (user?.email ?? 'Your account')}
          </AppText>
          <AppText size={13} color={colors.textMuted}>
            Signed in
          </AppText>
        </View>
      </View>

      {!consented && (
        <Card title="One more step">
          <Checkbox checked={agreed} onChange={setAgreed} label="I accept the Terms of Service and Privacy Notice." />
          <Button label="Confirm" onPress={() => void recordConsent().catch(() => setError('We couldn’t save that. Please try again.'))} disabled={!agreed} />
        </Card>
      )}

      <Card title="Order updates on this phone">
        <AppText size={13} color={colors.textMuted}>
          {notifying ? 'We’ll notify you when an order is packed, on its way and delivered.' : 'Get a notification when an order is packed, on its way and delivered.'}
        </AppText>
        {notifying ? (
          <Button
            label="Turn off"
            kind="secondary"
            onPress={() => void unregisterPush().then((removed) => {
              setNotifying(false);
              setError(removed ? null : 'Updates are off in the app. We’ll retry disconnecting this phone when it’s online.');
            }).catch(() => setError('We couldn’t update your notification preference. Try again.'))}
          />
        ) : (
          <Button label="Turn on" kind="secondary" onPress={() => void registerForPush(undefined, { enable: true }).then((result) => {
            setNotifying(result === 'granted');
            setError(result === 'granted' ? null : result === 'denied' ? 'Allow notifications in your phone settings to receive order updates.' : 'We couldn’t turn on order updates. Try again.');
          }).catch(() => setError('We couldn’t update your notification preference. Try again.'))} />
        )}
      </Card>

      {error ? <Notice>{error}</Notice> : null}
    </>
  );
}

/** Sign out and delete: kept at the very bottom, away from the everyday options. */
function AccountActions() {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  const { signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function confirmSignOut() {
    Alert.alert('Sign out?', 'Your bag stays on this phone.', [
      { text: 'Stay signed in', style: 'cancel' },
      { text: 'Sign out', onPress: () => void signOut() },
    ]);
  }

  function confirmDelete() {
    Alert.alert(
      'Delete your account?',
      'This removes your saved addresses, numbers, wishlist and reviews. Your past orders stay in our records without your name or phone. This can’t be undone.',
      [
        { text: 'Keep my account', style: 'cancel' },
        {
          text: 'Delete my account',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            setError(null);
            deleteMyAccount()
              .then((message) => setError(message))
              .catch(() => setError('We couldn’t delete your account. Please try again.'))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }

  return (
    <View style={styles.actions}>
      {error ? <Notice>{error}</Notice> : null}
      <Button label="Sign out" kind="secondary" onPress={confirmSignOut} />
      <AppText size={12} color={colors.textMuted} style={styles.deleteNote}>
        You can delete your account once any orders in progress have been delivered or cancelled.
      </AppText>
      <Pressable accessibilityRole="button" disabled={busy} onPress={confirmDelete} style={({ pressed }) => [styles.deleteLink, (pressed || busy) && { opacity: 0.6 }]}>
        <AppText weight="semibold" size={14} color={colors.danger}>
          {busy ? 'Deleting…' : 'Delete my account'}
        </AppText>
      </Pressable>
    </View>
  );
}

function LinkRow({ icon, title, text, onPress, disabled }: { icon: IconName; title: string; text: string; onPress: () => void; disabled?: boolean }) {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }, disabled && { opacity: 0.4 }]}
    >
      <View style={styles.icon}>
        <Icon name={icon} size={20} color={colors.ink} />
      </View>
      <View style={styles.flex}>
        <AppText weight="bold" size={15}>
          {title}
        </AppText>
        <AppText size={13} color={colors.textMuted}>
          {text}
        </AppText>
      </View>
      <Icon name="chevronRight" size={18} color={colors.textMuted} strokeWidth={2} />
    </Pressable>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 20, paddingBottom: 120, gap: 18 },
  flex: { flex: 1 },
  appearance: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radii.xl, backgroundColor: colors.canvas },
  segment: { flexDirection: 'row', padding: 3, borderRadius: radii.pill, backgroundColor: colors.surface },
  segmentItem: { minHeight: 36, minWidth: 52, paddingHorizontal: 10, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.ink },
  lh: { lineHeight: 19 },
  inlineLinks: { flexDirection: 'row', gap: 18 },
  sectionLabel: { letterSpacing: 0.8, marginTop: 4, marginBottom: -8, paddingLeft: 4 },
  list: { borderRadius: radii.xl, backgroundColor: colors.canvas, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 68, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radii.xl, backgroundColor: colors.canvas },
  avatar: { width: 52, height: 52, borderRadius: radii.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: 6, marginTop: 10 },
  deleteLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  deleteNote: { textAlign: 'center' },
  icon: { width: 44, height: 44, borderRadius: radii.lg, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
});
