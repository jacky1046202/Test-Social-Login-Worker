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

// API 端點 3: 取得當前登入者的資訊 (受保護的路由)
app.get('/api/me', async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY, {
      global: {
          headers: { Authorization: c.req.header('Authorization') },
      },
  });

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
  }

  return c.json({
      id: user.id,
      email: user.email,
  });
});

export default app;