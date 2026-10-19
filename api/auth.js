// Auth operations are available only through the guarded login/session/team endpoints.
export default function handler(req,res){res.setHeader('Cache-Control','no-store');res.status(404).json({error:'Not found'});}
