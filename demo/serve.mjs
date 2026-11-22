import './build.mjs';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';

const html = readFileSync(new URL('./dist/index.html', import.meta.url));
const port = Number(process.env.PORT || 4173);
createServer((request,response)=>{
  const path = new URL(request.url,'http://127.0.0.1').pathname;
  if(path==='/' || path==='/index.html'){
    response.writeHead(200, {'content-type':'text/html;charset=utf-8','cache-control':'no-store'});
    response.end(html);
  }else{
    response.writeHead(404).end();
  }
}).listen(port,'127.0.0.1',()=>console.log('Plate demo: http://127.0.0.1:'+port));
