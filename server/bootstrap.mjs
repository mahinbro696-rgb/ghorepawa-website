import {createHash,randomUUID} from 'node:crypto';
import {transaction} from './db.mjs';
import {staffEmail} from './auth.mjs';
export async function applyOwnerCredentials(client,hash){
  if(typeof hash!=='string'||!hash.length)throw new Error('Owner credential hash is required');
  const revision=createHash('sha256').update(hash).digest('hex');
  await client.query('SELECT pg_advisory_xact_lock(823709416)');
  await client.query('CREATE TABLE IF NOT EXISTS team_bootstrap (revision text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
  if((await client.query('SELECT revision FROM team_bootstrap WHERE revision=$1',[revision])).rows.length)return false;
  const owner=(await client.query("SELECT id,username FROM team_members WHERE role='admin' FOR UPDATE")).rows[0];
  const id=owner?.id||randomUUID();
  if(!owner){
    await client.query(`INSERT INTO team_auth_users(id,name,email,"emailVerified","createdAt","updatedAt",role) VALUES($1,$2,$3,false,now(),now(),'admin')`,[id,'Primary administrator',staffEmail('admin')]);
    await client.query("INSERT INTO team_members(id,username,name,role,status) VALUES($1,'admin',$2,'admin','active')",[id,'Primary administrator']);
  }else{
    await client.query("UPDATE team_members SET username='admin',status='active' WHERE id=$1",[id]);
    await client.query(`UPDATE team_auth_users SET email=$2,role='admin',"updatedAt"=now() WHERE id=$1`,[id,staffEmail('admin')]);
  }
  const account=(await client.query(`SELECT id FROM team_auth_accounts WHERE "userId"=$1 AND "providerId"='credential'`,[id])).rows[0];
  if(account)await client.query(`UPDATE team_auth_accounts SET password=$2,"updatedAt"=now() WHERE id=$1`,[account.id,hash]);
  else await client.query(`INSERT INTO team_auth_accounts(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,'credential',$2,$3,now(),now())`,[randomUUID(),id,hash]);
  await client.query('DELETE FROM team_auth_sessions WHERE "userId"=$1',[id]);
  await client.query("INSERT INTO team_events(actor_id,target_id,kind) VALUES($1,$1,'owner-login-configured')",[id]);
  await client.query('INSERT INTO team_bootstrap(revision) VALUES($1)',[revision]);
  return true;
}
export async function bootstrapOwner(){
 const hash=process.env.ADMIN_INITIAL_PASSWORD_HASH;
 if(!hash)return;
 return transaction(client=>applyOwnerCredentials(client,hash));
}
