import {AppError} from './domain.mjs';
export function decodeProductImage(value){
 if(typeof value!=='string'||value.length>2800000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value))throw new AppError(400,'Choose a PNG, JPEG or WebP image up to 2 MB.');
 const [head,encoded]=value.split(',');const buffer=Buffer.from(encoded,'base64');
 if(buffer.length<16||buffer.length>2*1024*1024||buffer.toString('base64')!==encoded)throw new AppError(400,'Invalid or oversized image.');
 let extension='';
 if(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&buffer.subarray(-8,-4).toString()==='IEND')extension='png';
 if(buffer[0]===255&&buffer[1]===216&&buffer[2]===255&&buffer.at(-2)===255&&buffer.at(-1)===217)extension='jpg';
 if(buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP')extension='webp';
 const expected=head.includes('jpeg')?'jpg':head.includes('png')?'png':'webp';
 if(!extension||extension!==expected)throw new AppError(400,'Image content does not match the selected format.');
 return {buffer,extension};
}
