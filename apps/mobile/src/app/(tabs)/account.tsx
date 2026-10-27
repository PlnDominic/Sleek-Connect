import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { colors, radii, type IconName } from '@sleek/shared';
import { AppText } from '@/components/AppText';
import { Button, Card, Field, Notice } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { Checkbox, useScreenTop } from '@/components/ui';
import { deleteMyAccount } from '@/lib/account';
import { normalizeGhanaPhone, useAuth } from '@/lib/auth';
import { pushAllowed, registerForPush, unregisterPush } from '@/lib/push';
import { openSite, siteConfigured } from '@/lib/site';

const siteLinks: { icon: IconName; title: string; text: string; path: string }[] = [
  { icon: 'headset', title: 'Help and contact', text: 'Delivery, returns and how to reach us', path: '/help' },
  { icon: 'lock', title: 'Privacy notice', text: 'How we use your data', path: '/privacy' },
  { icon: 'clipboard', title: 'Terms of service', text: 'The terms for shopping with us', path: '/terms' },
];

export default function AccountScreen() {
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

      <View style={styles.list}>
        <LinkRow icon="box" title="Your orders" text="Track an order, or find one by its number" onPress={() => router.push('/orders')} />
        {siteLinks.map((l) => (
          <LinkRow key={l.path} icon={l.icon} title={l.title} text={l.text} onPress={() => void openSite(l.path)} disabled={!siteConfigured} />
        ))}
      </View>
    </ScrollView>
  );
}

function SignedOut() {
  const { sendPhoneOtp, verifyPhoneOtp, signInWithGoogle, recordConsent } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
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

  const sendCode = () => {
    const normalized = normalizeGhanaPhone(phone);
    if (!normalized) return setError('Enter a valid Ghana number, for example 024 123 4567.');
    void run(async () => {
      await sendPhoneOtp(normalized);
      setPhone(normalized);
      setStep('code');
    }, 'We couldn’t send a code to that number. Check the number or try again later.');
  };

  const confirm = () => {
    if (!/^\d{6}$/.test(code)) return setError('Enter the six-digit code from the text message.');
    void run(async () => {
      await verifyPhoneOtp(phone, code);
      await recordConsent().catch(() => {});
    }, 'That code is invalid or expired. Request a new code and try again.');
  };

  const google = () =>
    void run(async () => {
      if (await signInWithGoogle()) await recordConsent().catch(() => {});
    }, 'We couldn’t sign you in with Google. Please try again.');

  return (
    <Card title="Sign in">
      <AppText size={13} color={colors.textMuted} style={styles.lh}>
        Sign in to see your orders on every phone and fill in checkout faster. You can still check out without an account.
      </AppText>
      <Checkbox checked={agreed} onChange={setAgreed} label="I’m 18 or older and accept the Terms of Service and Privacy Notice." />
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
      {step === 'phone' ? (
        <>
          <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="024 123 4567" />
          <Button label="Continue with phone" onPress={sendCode} disabled={!agreed} busy={busy} />
        </>
      ) : (
        <>
          <AppText size={13} color={colors.textMuted}>
            We sent a six-digit code to {phone}.
          </AppText>
          <Field label="Verification code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={6} />
          <Button label="Verify and sign in" onPress={confirm} disabled={!agreed} busy={busy} />
          <Button label="Use a different number" kind="secondary" onPress={() => { setStep('phone'); setCode(''); setError(null); }} />
        </>
      )}
      <Button label="Continue with Google" kind="secondary" onPress={google} disabled={!agreed || busy} />
      {error ? <Notice>{error}</Notice> : null}
    </Card>
  );
}

function SignedIn() {
  const { user, consented, recordConsent, signOut } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [notifying, setNotifying] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void pushAllowed().then(setNotifying);
  }, []);

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
    <>
      <Card title="You’re signed in">
        <AppText size={14}>{user?.phone ? `+${user.phone.replace(/^\+/, '')}` : (user?.email ?? 'Your account')}</AppText>
      </Card>

      {!consented && (
        <Card title="One more step">
          <Checkbox checked={agreed} onChange={setAgreed} label="I’m 18 or older and accept the Terms of Service and Privacy Notice." />
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
            onPress={() => void unregisterPush().then(() => setNotifying(false))}
          />
        ) : (
          <Button label="Turn on" kind="secondary" onPress={() => void registerForPush().then((r) => setNotifying(r === 'granted'))} />
        )}
      </Card>

      {error ? <Notice>{error}</Notice> : null}
      <Button label="Sign out" kind="secondary" onPress={confirmSignOut} />
      <Button label="Delete my account" kind="danger" onPress={confirmDelete} busy={busy} />
    </>
  );
}

function LinkRow({ icon, title, text, onPress, disabled }: { icon: IconName; title: string; text: string; onPress: () => void; disabled?: boolean }) {
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 20, paddingBottom: 28, gap: 18 },
  flex: { flex: 1 },
  lh: { lineHeight: 19 },
  inlineLinks: { flexDirection: 'row', gap: 18 },
  list: { borderTopWidth: 1, borderTopColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 68, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  icon: { width: 44, height: 44, borderRadius: radii.lg, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
});
