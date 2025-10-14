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
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = c.env;
    const authorization = c.req.header('Authorization');
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: authorization },
      },
    });

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
app.post('/api/auth/logout', async (c) => {
  try {
    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: c.req.header('Authorization') },
      },
    });

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

// === API 端点 5: 呼叫 Supabase Edge Function 来执行 "new_exercise" ===
app.post('/api/exercise', async (c) => {
  try {
    // 1. 取得 Supabase Client 并验证使用者身份
    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: c.req.header('Authorization') } },
    });
    const { data: { user } } = await supabase.auth.getUser();

    // 如果验证失败，就提早退出
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // 2. 从前端请求中取得运动相关的资料
    const body = await c.req.json();
    const { startTime, endTime, description } = body;
    if (!startTime || !endTime) {
      return c.json({ error: 'Start time and end time are required.' }, 400);
    }

    // 3. 呼叫 Supabase Edge Function (这是新的部分！)
    // Supabase SDK 提供了 .functions.invoke() 方法来做这件事
    const { data, error } = await supabase.functions.invoke('new-exercise', {
      body: {
        start_time: startTime,
        end_time: endTime,
        description: description,
        user_id: user.id, // 把验证过的 user.id 传给 Edge Function
      },
    });

    if (error) {
      console.error('Edge Function invoke error:', error);
      return c.json({ error: 'Failed to invoke exercise function.', details: error.message }, 500);
    }

    // 4. 将 Edge Function 的回传结果，再转传给前端
    return c.json(data);

  } catch (e) {
    console.error('/api/exercise endpoint crashed:', e);
    return c.json({ error: 'An unexpected server error occurred.' }, 500);
  }
});

export default app;
