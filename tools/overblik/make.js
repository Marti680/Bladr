const fs=require('fs');
const {Document,Packer,Paragraph,TextRun,HeadingLevel,Table,TableRow,TableCell,WidthType,ShadingType,LevelFormat,AlignmentType,BorderStyle}=require('docx');
const D=JSON.parse(fs.readFileSync(__dirname+'/overblik.json','utf8'));
const FONT='Calibri', BLUE='1F5F8B', W=9638;
const P=(text,o={})=>new Paragraph({spacing:{after:80},...o,children:[new TextRun({text,font:FONT,size:21,...(o.run||{})})]});
const bullet=t=>new Paragraph({numbering:{reference:'b',level:0},spacing:{after:40},children:[new TextRun({text:t,font:FONT,size:21})]});
const border={style:BorderStyle.SINGLE,size:4,color:'C9D1D8'};
const borders={top:border,bottom:border,left:border,right:border};
function table(head,rows,widths){
  const cell=(t,w,h)=>new TableCell({width:{size:w,type:WidthType.DXA},borders,margins:{top:60,bottom:60,left:100,right:100},
    shading:h?{type:ShadingType.CLEAR,color:'auto',fill:'D4E4EF'}:undefined,
    children:[new Paragraph({children:[new TextRun({text:t,font:FONT,size:19,bold:!!h})]})]});
  return new Table({width:{size:W,type:WidthType.DXA},columnWidths:widths,rows:[
    new TableRow({tableHeader:true,children:head.map((h,i)=>cell(h,widths[i],true))}),
    ...rows.map(r=>new TableRow({cantSplit:true,children:r.map((t,i)=>cell(t,widths[i],false))}))]});
}
const kids=[
  new Paragraph({heading:HeadingLevel.TITLE,children:[new TextRun({text:'Bladr – overblik',font:FONT})]}),
  P('Funktioner, planer og idéer · opdateret '+D.opdateret,{run:{color:'5F6C78'}}),
  P('Dokumentet holdes opdateret, når der kommer nye funktioner, og når en idé sættes på venteliste. Bladr ligger på marti680.github.io/Bladr, og koden på github.com/Marti680/Bladr.'),
  new Paragraph({heading:HeadingLevel.HEADING_1,children:[new TextRun({text:'1. Funktioner i Bladr i dag',font:FONT})]}),
];
for(const [h,items] of D.funktioner){kids.push(new Paragraph({heading:HeadingLevel.HEADING_2,children:[new TextRun({text:h,font:FONT})]}));items.forEach(t=>kids.push(bullet(t)))}
kids.push(new Paragraph({heading:HeadingLevel.HEADING_1,children:[new TextRun({text:'2. Planlagt (besluttet '+D.opdateret+')',font:FONT})]}));
kids.push(table(['Funktion','Hvad det går ud på'],D.planlagt,[2600,7038]));
kids.push(new Paragraph({heading:HeadingLevel.HEADING_1,children:[new TextRun({text:'3. Venteliste',font:FONT})]}));
kids.push(P('Idéer, du har overvejet eller sat på pause. Status viser, hvor de står.'));
kids.push(table(['Idé','Hvad det går ud på','Foreslået','Status'],D.venteliste,[2050,4500,1188,1900]));
kids.push(new Paragraph({heading:HeadingLevel.HEADING_1,children:[new TextRun({text:'4. Mulige huller',font:FONT})]}));
kids.push(P('Ting, som PDF-programmer som Adobe og Bluebeam typisk har, men som Bladr mangler. Ikke besluttet – kun til inspiration.'));
kids.push(table(['Funktion','Hvorfor det kunne være relevant'],D.huller,[3000,6638]));
const doc=new Document({
  styles:{default:{document:{run:{font:FONT,size:21}}},paragraphStyles:[
    {id:'Title',name:'Title',basedOn:'Normal',run:{font:FONT,size:44,bold:true,color:BLUE},paragraph:{spacing:{before:0,after:60}}},
    {id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',quickFormat:true,run:{font:FONT,size:30,bold:true,color:BLUE},paragraph:{spacing:{before:320,after:120},keepNext:true,outlineLevel:0}},
    {id:'Heading2',name:'Heading 2',basedOn:'Normal',next:'Normal',quickFormat:true,run:{font:FONT,size:24,bold:true,color:'1B232B'},paragraph:{spacing:{before:200,after:60},keepNext:true,outlineLevel:1}}]},
  numbering:{config:[{reference:'b',levels:[{level:0,format:LevelFormat.BULLET,text:'•',alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:360,hanging:260}}}}]}]},
  sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1134,bottom:1134,left:1134,right:1134}}},children:kids}]});
Packer.toBuffer(doc).then(b=>fs.writeFileSync(process.argv[2]||'Bladr - overblik.docx',b));
