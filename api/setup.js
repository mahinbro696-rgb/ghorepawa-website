import {endpoint} from '../server/http.mjs';
import {getPool} from '../server/db.mjs';
// Owner credentials are provisioned server-side. Public owner signup is disabled.
export default endpoint(['GET'],async(req,res)=>{
 const {rows}=await getPool().query("SELECT EXISTS(SELECT 1 FROM team_members WHERE role='admin') AS configured");
 res.json({configured:rows[0].configured});
});
