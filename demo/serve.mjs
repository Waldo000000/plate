import './build.mjs';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';

const routes=new Map([
 ['/', ['./dist/index.html','text/html;charset=utf-8']],
 ['/index.html',['./dist/index.html','text/html;charset=utf-8']],
 ['/capture.html',['./dist/capture.html','text/html;charset=utf-8']]
]);
const port = Number(process.env.PORT || 4173);
createServer((request,response)=>{
  const path = new URL(request.url,'http://127.0.0.1').pathname;
  if(routes.has(path)){
    const [file,type]=routes.get(path);
    response.writeHead(200, {'content-type':type,'cache-control':'no-store'});
    response.end(readFileSync(new URL(file,import.meta.url)));
  }else{
    response.writeHead(404).end();
  }
}).listen(port,'127.0.0.1',()=>console.log('Plate demo: http://127.0.0.1:'+port));
