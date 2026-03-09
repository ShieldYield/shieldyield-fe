const fs = require('fs');
const path = require('path');

const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
       if (!filePath.includes('node_modules') && !filePath.includes('.next')) {
           filelist = walkSync(filePath, filelist);
       }
    } else {
      filelist.push(filePath);
    }
  });
  return filelist;
}

const files = walkSync('./src').filter(f => f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.css'));

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // 1. font color #006aff -> #598eff
    // The user specifically said "font #006aff". In Tailwind this is often text-[#006aff].
    content = content.replace(/text-\[\#006aff\]/g, 'text-[#598eff]');
    
    // 2. #0000ff -> #000080 with 50% opacity (rgba(0,0,128,0.5) or #00008080)
    // The user mentioned #0000ff.
    content = content.replace(/#0000ff/gi, 'rgba(0, 0, 128, 0.5)');

    // 3. remove border for all buttons
    if (file.endsWith('.tsx')) {
        content = content.replace(/<button([^>]*)className=(["'])(.*?)\2/g, (match, p1, quote, p3) => {
            let classes = p3.split(' ').filter(c => !c.startsWith('border') || c === 'border-none');
            if (!classes.includes('border-none')) classes.push('border-none');
            return `<button${p1}className=${quote}${classes.join(' ')}${quote}`;
        });
        content = content.replace(/<button([^>]*)className=\{`([^`]+)`\}/g, (match, p1, p2) => {
            let classes = p2.split(/\s+/).filter(c => !c.startsWith('border') || c === 'border-none');
            if (!classes.includes('border-none')) classes.push('border-none');
            return `<button${p1}className={\`${classes.join(' ')}\`}`;
        });
    }

    // 4. remove letter spacing (tracking-*)
    content = content.replace(/\btracking-(tight|tighter|wide|wider|widest)\b/g, '');

    if (content !== original) {
        fs.writeFileSync(file, content);
    }
});
