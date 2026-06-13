async function test() {
  const html = await (await fetch('https://expensev67.vercel.app/')).text();
  const match = html.match(/src=\"(\/assets\/index-[^\"]+\.js)\"/);
  if (!match) { console.log('no match'); return; }
  const jsUrl = 'https://expensev67.vercel.app' + match[1];
  const js = await (await fetch(jsUrl)).text();
  const sbMatches = js.match(/https:\/\/[^\.]+\.supabase\.co/g);
  if (sbMatches) { console.log(sbMatches[0]); }
  else { console.log('no supabase url found in bundle'); }
}
test();
