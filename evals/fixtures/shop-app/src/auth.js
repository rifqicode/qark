const users = [{ email: 'rifqi@example.com', passwordHash: 'x9f' }];

export function login(email, passwordHash) {
  const user = users.find(u => u.email === email);
  if (!user || user.passwordHash !== passwordHash) throw new Error('invalid credentials');
  return { email: user.email };
}
