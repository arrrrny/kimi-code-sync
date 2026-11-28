export default {
  id: 'warmup-1',
  name: 'Prove you can read the tool’s help',
  muscle: 'knows how to invoke the software',
  brief:
    'In the sandbox (gym/.sandbox/), create help.txt containing the word "Usage" — ' +
    'simulating that you ran the software’s help command and captured its output.',
  async verify(ctx) {
    const out = await ctx.read(ctx.path('gym', '.sandbox', 'help.txt'));
    if (!out || !out.includes('Usage')) {
      return { ok: false, note: 'help.txt missing or lacks "Usage"' };
    }
    return { ok: true };
  },
};
