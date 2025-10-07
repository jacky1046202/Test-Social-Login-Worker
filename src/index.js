import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';

const app = new Hono();

// API 端點 1: 發起 Social Login
app.get('/api/auth/login/:provider', async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  const provider = c.req.param('provider');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider,
    options: {
      redirectTo: `${new URL(c.req.url).origin}/api/auth/callback`,
    },
  });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.redirect(data.url);
});

// API 端點 2: 處理 Social Login 成功後的回呼
app.get('/api/auth/callback', async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
  const code = c.req.query('code');

  if (!code) {
    return c.json({ error: 'No code provided' }, 400);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return c.json({ error: error.message }, 500);
  }
  
  // 這裡可以改成你們前端應用的實際網址
  return c.redirect('https://our-task-app.pages.dev/dashboard');
});

// === API 端点 3: 取得使用者资讯 (最终修正版) ===
// 明确地从 Hono Context 中传递 env 和 headers
app.get('/api/me', async (c) => {
  try {
    // 从 Context 中取得环境变量，这是在 Worker 中最稳妥的方式
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = c.env;
    
    // 从 Context 中取得请求标头
    const authorization = c.req.header('Authorization');
    
    // 建立 Supabase Client
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: authorization },
      },
    });

    // 取得使用者资讯
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      console.error('Supabase getUser error:', error);
      return c.json({ error: 'Unauthorized or invalid token' }, 401);
    }

    return c.json({
      id: user.id,
      email: user.email,
    });
  } catch (e) {
    console.error('/api/me endpoint crashed:', e);
    return c.json({ error: 'An unexpected server error occurred' }, 500);
  }
});

// === API 端点 4: 登出 (修正版) ===
// 采用与 /api/me 完全相同的「手动机」来确保一致性
app.post('/api/auth/logout', async (c) => {
  try {
    // 建立一个「带有身份」的 client，就像 /api/me 一样
    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: c.req.header('Authorization') },
      },
    });

    // 用这个带有身份的 client 来执行登出
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Supabase signOut error:', error);
      return c.json({ error: 'Failed to sign out', details: error.message }, 500);
    }

    return c.json({ message: 'Successfully logged out' });

  } catch (e) {
    console.error('Logout endpoint crashed:', e);
    return c.json({ error: 'An unexpected error occurred' }, 500);
  }
});

export default app;