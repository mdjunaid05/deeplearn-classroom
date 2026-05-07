const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            if(file.endsWith('.jsx')) results.push(file);
        }
    });
    return results;
}

const files = walk('./src');
let changed = 0;

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let orig = content;
    
    // 1. Add borders, rounded-2xl, shadows, and hover effects to .glass and surface containers
    content = content.replace(/className="([^"]*\b(glass|glass-light|bg-surface-800|bg-surface-900)\b[^"]*)"/g, (match, classes) => {
        let newClasses = classes.split(' ');
        
        if(!newClasses.includes('rounded-2xl') && !newClasses.some(c => c.startsWith('rounded-'))) newClasses.push('rounded-2xl');
        if(!newClasses.includes('shadow-lg') && !newClasses.some(c => c.startsWith('shadow-'))) newClasses.push('shadow-lg');
        if(!newClasses.includes('hover:shadow-xl')) newClasses.push('hover:shadow-xl');
        if(!newClasses.includes('border') && !newClasses.includes('border-b')) newClasses.push('border', 'border-slate-200/60');
        if(!newClasses.includes('hover:border-cyan-400')) newClasses.push('hover:border-cyan-400');
        if(!newClasses.includes('transition-all')) newClasses.push('transition-all', 'duration-300');
        
        return `className="${[...new Set(newClasses)].join(' ')}"`;
    });

    // 2. Improve Solid Button Styles (bg-primary-600 without opacity modifiers)
    content = content.replace(/className="([^"]*\bbg-primary-600\b(?!\/)[^"]*)"/g, (match, classes) => {
        let newClasses = classes.split(' ');
        if(!newClasses.includes('hover:shadow-[0_0_15px_rgba(34,211,238,0.4)]')) {
            newClasses.push('hover:shadow-[0_0_15px_rgba(34,211,238,0.4)]');
            newClasses.push('hover:bg-primary-500');
            newClasses.push('transition-all', 'duration-300');
        }
        // fix text color for solid buttons
        newClasses = newClasses.map(c => c === 'text-white' ? 'text-true-white' : c);
        if(!newClasses.includes('text-true-white') && !newClasses.includes('text-black')) {
             newClasses.push('text-true-white');
        }
        return `className="${[...new Set(newClasses)].join(' ')}"`;
    });

    // 3. Headings Typography
    content = content.replace(/<(h[1-6])[^>]*className="([^"]*)"/g, (match, tag, classes) => {
        let newClasses = classes.split(' ');
        if(!newClasses.includes('font-bold') && !newClasses.includes('font-semibold')) {
            newClasses.push('font-bold');
        }
        // Change text-white to text-slate-800 for headings
        newClasses = newClasses.map(c => c === 'text-white' ? 'text-slate-800' : c);
        if(!newClasses.some(c => c.startsWith('text-slate-')) && !newClasses.includes('text-black')) {
            newClasses.push('text-slate-800');
        }
        return match.replace(classes, [...new Set(newClasses)].join(' '));
    });

    // 4. Highlight Status / Live Indicators
    if (content.includes('bg-red-500 rounded-full')) {
        content = content.replace(/bg-red-500 rounded-full/g, 'bg-cyan-500 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.8)] animate-pulse');
    }
    if (content.includes('bg-green-500 rounded-full')) {
        content = content.replace(/bg-green-500 rounded-full/g, 'bg-cyan-400 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.6)] animate-pulse');
    }

    // 5. Fix text-slate-400 globally to text-slate-600
    content = content.replace(/\btext-slate-400\b/g, 'text-slate-600');
    content = content.replace(/\btext-slate-300\b/g, 'text-slate-500');
    content = content.replace(/\btext-gray-400\b/g, 'text-slate-600');
    
    // 6. Section dividers - add a subtle border bottom to headers/nav
    if(file.includes('Navbar.jsx')) {
        content = content.replace(/className="([^"]*\bglass\b[^"]*)"/, (match, classes) => {
            let newClasses = classes.split(' ').filter(c => c !== 'border' && !c.includes('border-slate-200/60'));
            newClasses.push('border-b', 'border-slate-200/60', 'shadow-sm');
            return `className="${[...new Set(newClasses)].join(' ')}"`;
        });
    }

    // 7. General fixes for inverted text-white outside buttons
    // Since 'white' is dark, any 'text-white' that wasn't touched above might need to be 'text-slate-800' if it's meant to be text.
    // However, icons sometimes use text-white, but that's fine.
    
    if (content !== orig) {
        fs.writeFileSync(file, content);
        changed++;
    }
});
console.log(`Updated ${changed} files.`);
