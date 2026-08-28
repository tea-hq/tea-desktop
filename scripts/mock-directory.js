;(() => {
  const tenant = { id: 'tenant-demo', domain: 'demo.example.com', displayName: 'Demo Workspace' }
  const names = [
    'Ada Lovelace',
    'Grace Hopper',
    'Linus Torvalds',
    'Margaret Hamilton',
    'Ken Thompson',
    'Barbara Liskov',
    'Donald Knuth',
    'Radia Perlman',
    'Edsger Dijkstra',
    'Hedy Lamarr',
    'Alan Turing',
    'Katherine Johnson',
  ]
  const users = names.map((displayName, index) => {
    const username = displayName.toLowerCase().replaceAll(' ', '.')
    return {
      tenant,
      center: { userId: `user-demo-${String(index + 1).padStart(2, '0')}`, displayName },
      oidc: {
        subject: `oidc-demo-${index + 1}`,
        preferredUsername: username,
        email: `${username}@demo.example.com`,
        emailVerified: index !== 8,
        avatarUrl: index % 3 === 0 ? `https://i.pravatar.cc/96?img=${index + 12}` : '',
      },
      im: {
        provider: 'yunxin',
        account: index % 4 === 0 ? `im_${index + 1}` : '',
        status: index % 4 === 0 ? 'ready' : index % 4 === 1 ? 'pending' : 'error',
      },
    }
  })
  localStorage.setItem('tea.directory.mock', JSON.stringify({ schemaVersion: 1, users }))
  location.reload()
})()
