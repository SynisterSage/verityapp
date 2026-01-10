import supabaseAdmin from '@src/services/supabase';

const SHORT_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function formatShortCode(code: string) {
  const cleaned = code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const parts = [cleaned.slice(0, 4), cleaned.slice(4, 8)].filter(Boolean);
  return parts.join('-');
}

export async function generateUniqueShortCode() {
  for (let attempts = 0; attempts < 6; attempts += 1) {
    const seed = Array.from({ length: 8 }, () =>
      SHORT_CODE_CHARSET[Math.floor(Math.random() * SHORT_CODE_CHARSET.length)]
    ).join('');
    const code = formatShortCode(seed);
    const { data } = await supabaseAdmin
      .from('profile_invites')
      .select('id')
      .eq('short_code', code)
      .limit(1);
    if (!data?.length) {
      return code;
    }
  }
  return null;
}
