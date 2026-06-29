# Auth Testing Playbook (Emergent Google Auth)

See main integration playbook. Use mongosh to insert a test user and session, then set the `session_token` cookie via Playwright to test protected pages.

## Test User Creation
```bash
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  credits: 100,
  role: 'user',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
"
```

## API Test
```
curl -X GET "$BACKEND_URL/api/auth/me" -H "Authorization: Bearer SESSION_TOKEN"
```

## Browser Test
Set the `session_token` cookie with `domain` matching the preview host, `httpOnly: true, secure: true, sameSite: None`, then navigate to `/dashboard`.
