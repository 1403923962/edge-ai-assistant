// Test if stdin can receive data
process.stdin.setEncoding(null);
process.stdin.resume();

console.error('Waiting for stdin data...');

process.stdin.on('readable', () => {
  console.error('[stdin] readable event!');
  let chunk;
  while ((chunk = process.stdin.read()) !== null) {
    console.error('[stdin] received:', chunk.length, 'bytes');
    console.error('[stdin] data:', chunk.toString('hex').substring(0, 100));
  }
});

process.stdin.on('end', () => {
  console.error('[stdin] ended');
  process.exit(0);
});

process.stdin.on('error', (err) => {
  console.error('[stdin] error:', err);
});

// Keep process alive
setInterval(() => {
  console.error('Still alive...');
}, 5000);
