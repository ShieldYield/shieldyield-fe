const fs = require('fs');
const path = require('path');

const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    filelist = fs.statSync(path.join(dir, file)).isDirectory()
      ? walkSync(path.join(dir, file), filelist)
      : filelist.concat(path.join(dir, file));
  });
  return filelist;
}

const files = walkSync('./src').filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // 1. ubah warna font #006aff menjadi #598eff
    content = content.replace(/text-\[\#006aff\]/g, 'text-[#598eff]');

    // 2. lalu ubah juga #0000ff agar menjadi #000080 dengan opacity nya 50%
    // If it's something like shadow-[0_0_15px_#0000ff] or similar, replace #0000ff with rgba(0,0,128,0.5)
    // Actually replace all #0000ff with rgba(0,0,128,0.5) inside classNames, or just #00008080.
    // Let's replace #0000ff with rgba(0,0,128,0.5)
    content = content.replace(/#0000ff/gi, 'rgba(0,0,128,0.5)');

    // 3. dan tolong hilangkan border untuk semua button
    // Find <button className="..."> and remove border-related classes, or add border-none
    // It's easier to remove 'border ', 'border-zinc-800', etc., inside button classNames.
    // Let's just do a regex replace for button tags.
    // E.g., /<button([^>]*)className="([^"]*)"/g
    content = content.replace(/<button([^>]*)className=(["'])(.*?)\2/g, (match, p1, quote, p3) => {
        let classes = p3.split(' ');
        classes = classes.filter(c => !c.startsWith('border'));
        if (!classes.includes('border-none')) {
            classes.push('border-none');
        }
        return `<button${p1}className=${quote}${classes.join(' ')}${quote}`;
    });
    // same for backticks
    content = content.replace(/<button([^>]*)className=\{`([^`]+)`\}/g, (match, p1, p2) => {
        let classes = p2.split(/\s+/);
        classes = classes.filter(c => !c.startsWith('border'));
        if (!classes.includes('border-none')) {
            classes.push('border-none');
        }
        return `<button${p1}className={\`${classes.join(' ')}\`}`;
    });

    // 7. Jarak antar huruf nya diperkecil (dempet/default) -> remove tracking classes
    content = content.replace(/\btracking-(tight|tighter|wide|wider|widest)\b/g, '');


    if (content !== original) {
        fs.writeFileSync(file, content);
    }
});
