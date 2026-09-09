from contextlib import asynccontextmanager
from pathlib import Path
from datetime import datetime, timezone, date
import os, secrets, math
import httpx
from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from .db import Base, engine, get_db
from .models import Household, User, Location, Product, Batch, Activity
from .schemas import Signup, LocationInput, ItemInput, ActionInput, ProductInput, SettingsInput
from .auth import current_user, hash_password, verify_password, issue_token
from .inventory import owned, path_for, add_batch, log, change_quantity, batch_dict
from .intelligence import consumption_forecast, recommendations
from .recognition import identify_photo

@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)
    yield

app = FastAPI(title='Home Digital Twin', lifespan=lifespan)
origins = [x.strip() for x in os.getenv('CORS_ORIGINS','').split(',') if x.strip()]
if origins: app.add_middleware(CORSMiddleware,allow_origins=origins,allow_methods=['GET','POST','PUT','DELETE'],allow_headers=['Authorization','Content-Type'])

@app.exception_handler(IntegrityError)
async def conflict(_, exc):
    return JSONResponse(status_code=409,content={'detail':'이미 존재하거나 동시에 변경된 데이터입니다. 새로고침 후 확인하세요'})

@app.get('/api/health')
def health(): return {'status':'ok'}

@app.post('/api/auth/signup')
def signup(data:Signup,db:Session=Depends(get_db)):
    if db.query(User).filter_by(email=data.email.lower()).first(): raise HTTPException(409,'이미 가입한 이메일입니다')
    if data.invite_code:
        household=db.query(Household).filter_by(invite_code=data.invite_code.strip().upper()).first()
        if not household: raise HTTPException(404,'초대 코드를 확인하세요')
    else:
        household=Household(name=data.household_name.strip(),invite_code=secrets.token_hex(8).upper())
        db.add(household);db.flush()
    user=User(email=data.email.lower(),password_hash=hash_password(data.password),household_id=household.id)
    db.add(user);db.commit()
    return issue_token(user)

@app.post('/api/auth/login')
def login(form:OAuth2PasswordRequestForm=Depends(),db:Session=Depends(get_db)):
    user=db.query(User).filter_by(email=form.username.strip().lower()).first()
    if not user or not verify_password(form.password,user.password_hash): raise HTTPException(401,'이메일 또는 비밀번호를 확인하세요')
    return issue_token(user)

@app.get('/api/me')
def me(db:Session=Depends(get_db),user:User=Depends(current_user)):
    h=db.get(Household,user.household_id)
    return {'email':user.email,'household_name':h.name,'invite_code':h.invite_code,'expiry_days':h.expiry_days,'photo_enabled':bool(os.getenv('OLLAMA_URL'))}

@app.put('/api/settings')
def settings(data:SettingsInput,db:Session=Depends(get_db),user:User=Depends(current_user)):
    h=db.get(Household,user.household_id);h.name=data.name.strip();h.expiry_days=data.expiry_days;db.commit()
    return {'ok':True}

@app.post('/api/invite/rotate')
def rotate(db:Session=Depends(get_db),user:User=Depends(current_user)):
    h=db.get(Household,user.household_id);h.invite_code=secrets.token_hex(8).upper();db.commit()
    return {'invite_code':h.invite_code}

def location_dict(db,l):
    return {k:getattr(l,k) for k in ('id','parent_id','name','kind','x','y','width','height')} | {'path':path_for(db,l.id)}

@app.get('/api/locations')
def locations(db:Session=Depends(get_db),user:User=Depends(current_user)):
    return [location_dict(db,l) for l in db.query(Location).filter_by(household_id=user.household_id).order_by(Location.id)]

def validate_parent(db,user,data,identity=None):
    parent=data.parent_id;seen=set()
    while parent is not None:
        if parent == identity or parent in seen: raise HTTPException(422,'자신 또는 하위 공간 안으로 이동할 수 없습니다')
        seen.add(parent);parent=owned(db,Location,parent,user).parent_id

@app.post('/api/locations')
def create_location(data:LocationInput,db:Session=Depends(get_db),user:User=Depends(current_user)):
    validate_parent(db,user,data)
    l=Location(household_id=user.household_id,**data.model_dump());db.add(l);db.commit()
    return location_dict(db,l)

@app.put('/api/locations/{identity}')
def edit_location(identity:int,data:LocationInput,db:Session=Depends(get_db),user:User=Depends(current_user)):
    l=owned(db,Location,identity,user);validate_parent(db,user,data,identity)
    for k,v in data.model_dump().items():setattr(l,k,v)
    db.commit();return location_dict(db,l)

@app.delete('/api/locations/{identity}')
def delete_location(identity:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
    l=owned(db,Location,identity,user)
    if db.query(Location).filter_by(parent_id=identity).first() or db.query(Batch).filter_by(location_id=identity).first() or db.query(Activity).filter_by(to_location_id=identity).first():
        raise HTTPException(409,'하위 공간 또는 재고·이력이 연결된 공간은 삭제할 수 없습니다')
    db.delete(l);db.commit();return {'ok':True}

@app.get('/api/items')
def items(q:str='',location_id:int|None=None,include_empty:bool=False,db:Session=Depends(get_db),user:User=Depends(current_user)):
    query=db.query(Batch).join(Product).filter(Batch.household_id==user.household_id)
    if q:query=query.filter(Product.name.contains(q.strip(),autoescape=True))
    if location_id:query=query.filter(Batch.location_id==location_id)
    if not include_empty:query=query.filter(Batch.quantity>0)
    return [batch_dict(db,b) for b in query.order_by(Product.name,Batch.expiry,Batch.id)]

@app.post('/api/items')
def receive(data:ItemInput,db:Session=Depends(get_db),user:User=Depends(current_user)):
    owned(db,Location,data.location_id,user)
    normalized=' '.join(data.name.casefold().split())
    if data.product_id:
        product=owned(db,Product,data.product_id,user)
    else:
        product=db.query(Product).filter_by(household_id=user.household_id,barcode=data.barcode).first() if data.barcode else None
        if not product:product=db.query(Product).filter_by(household_id=user.household_id,normalized_name=normalized).first()
        if not product:
            product=Product(household_id=user.household_id,name=data.name,normalized_name=normalized,barcode=data.barcode,unit=data.unit)
            db.add(product);db.flush()
    if data.barcode:
        if product.barcode and product.barcode!=data.barcode:raise HTTPException(409,'상품의 바코드가 다릅니다. 다른 이름으로 등록하세요')
        product.barcode=data.barcode
    batch=add_batch(db,user,product.id,data.location_id,data.expiry_date.isoformat() if data.expiry_date else '',data.quantity)
    log(db,user,batch,'receive',data.quantity,to_path=path_for(db,data.location_id),to_location_id=data.location_id)
    db.commit();return batch_dict(db,batch)

@app.post('/api/items/{identity}/actions')
def item_action(identity:int,data:ActionInput,db:Session=Depends(get_db),user:User=Depends(current_user)):
    batch=owned(db,Batch,identity,user);source=path_for(db,batch.location_id)
    if data.action!='adjust' and data.quantity<1:raise HTTPException(422,'수량은 1 이상이어야 합니다')
    if data.action!='adjust' and data.quantity>batch.quantity:raise HTTPException(409,'현재 재고보다 많습니다')
    if data.action=='move':
        if data.destination_id is None:raise HTTPException(422,'이동 위치를 선택하세요')
        owned(db,Location,data.destination_id,user)
        if data.destination_id==batch.location_id:raise HTTPException(422,'현재 위치와 다른 위치를 선택하세요')
        change_quantity(db,batch,-data.quantity)
        add_batch(db,user,batch.product_id,data.destination_id,batch.expiry,data.quantity)
        log(db,user,batch,'move',data.quantity,source,path_for(db,data.destination_id),data.destination_id)
    else:
        delta=data.quantity-batch.quantity if data.action=='adjust' else -data.quantity
        if data.action=='adjust' and not data.note.strip():raise HTTPException(422,'수량 정정 이유를 입력하세요')
        change_quantity(db,batch,delta)
        log(db,user,batch,data.action,delta if data.action=='adjust' else data.quantity,from_path=source,note=data.note)
    db.commit();return batch_dict(db,batch)

@app.get('/api/products')
def products(db:Session=Depends(get_db),user:User=Depends(current_user)):
    return [{'id':p.id,'name':p.name,'barcode':p.barcode,'unit':p.unit,'minimum':p.minimum,'lead_days':p.lead_days} for p in db.query(Product).filter_by(household_id=user.household_id)]

@app.put('/api/products/{identity}')
def edit_product(identity:int,data:ProductInput,db:Session=Depends(get_db),user:User=Depends(current_user)):
    p=owned(db,Product,identity,user);p.name=data.name.strip();p.normalized_name=' '.join(p.name.casefold().split());p.minimum=data.minimum;p.lead_days=data.lead_days
    db.commit();return {'ok':True}

@app.get('/api/products/{identity}/locations')
def suggested_locations(identity:int,db:Session=Depends(get_db),user:User=Depends(current_user)):
    owned(db,Product,identity,user)
    return [{'location_id':lid,'path':path_for(db,lid),'count':count,'reason':f'이 상품을 {count}번 보관한 위치'} for lid,count in recommendations(db,user,identity)]

@app.get('/api/activity')
def activity(offset:int=Query(0,ge=0),limit:int=Query(30,ge=1,le=100),db:Session=Depends(get_db),user:User=Depends(current_user)):
    rows=db.query(Activity).filter_by(household_id=user.household_id).order_by(Activity.id.desc()).offset(offset).limit(limit).all()
    return [{'id':r.id,'product_name':r.product_name,'action':r.action,'quantity':r.quantity,'from_path':r.from_path,'to_path':r.to_path,'note':r.note,'created_at':r.created_at,'actor':db.get(User,r.user_id).email} for r in rows]

@app.get('/api/insights')
def insights(db:Session=Depends(get_db),user:User=Depends(current_user)):
    today=datetime.now(timezone.utc).date();h=db.get(Household,user.household_id)
    batches=db.query(Batch).filter_by(household_id=user.household_id).all()
    events=db.query(Activity).filter_by(household_id=user.household_id).all()
    expiry=[];forecasts=[]
    for b in batches:
        if b.expiry and b.quantity>0:
            remaining=(date.fromisoformat(b.expiry)-today).days
            if remaining<=h.expiry_days:expiry.append(batch_dict(db,b)|{'days_left':remaining})
    for p in db.query(Product).filter_by(household_id=user.household_id):
        related=[b for b in batches if b.product_id==p.id]
        total=sum(b.quantity for b in related)
        usable=sum(b.quantity for b in related if not b.expiry or b.expiry>=today.isoformat())
        forecast=consumption_forecast([e for e in events if e.product_id==p.id],today)
        rate=forecast['daily_rate'];left=round(usable/rate,1) if rate and rate>0 else None
        forecasts.append({'product_id':p.id,'name':p.name,'unit':p.unit,'total':total,'usable':usable,'minimum':p.minimum,'lead_days':p.lead_days,'days_until_empty':left,'buy':usable<=p.minimum or (left is not None and left<=p.lead_days),**forecast})
    return {'expiry':sorted(expiry,key=lambda b:b['days_left']),'forecasts':forecasts,'expiry_days':h.expiry_days,'as_of':today}

@app.get('/api/barcode/{code}')
async def barcode(code:str,db:Session=Depends(get_db),user:User=Depends(current_user)):
    if not code.isascii() or not code.isdigit() or len(code) not in (8,12,13,14):raise HTTPException(422,'8·12·13·14자리 바코드를 입력하세요')
    p=db.query(Product).filter_by(household_id=user.household_id,barcode=code).first()
    if p:return {'source':'household','product_id':p.id,'name':p.name,'barcode':code,'unit':p.unit}
    try:
        async with httpx.AsyncClient(timeout=8,headers={'User-Agent':'HomeDigitalTwin/1.0 (personal inventory reference)'}) as client:
            r=await client.get(f'https://world.openfoodfacts.org/api/v2/product/{code}.json',params={'fields':'product_name,product_name_ko,brands'})
            r.raise_for_status();payload=r.json();product=payload.get('product',{})
        name=product.get('product_name_ko') or product.get('product_name')
        if name:return {'source':'Open Food Facts','name':name,'barcode':code,'requires_confirmation':True}
    except (httpx.HTTPError, ValueError):pass
    return {'source':'unknown','name':'','barcode':code,'message':'상품을 찾지 못했습니다. 이름을 입력하면 다음부터 기억합니다'}

@app.post('/api/recognize')
async def recognize(file:UploadFile=File(...),user:User=Depends(current_user)):
    content=await file.read(5*1024*1024+1)
    return await identify_photo(content)

app.mount('/',StaticFiles(directory=Path(__file__).resolve().parent.parent/'frontend',html=True),name='frontend')
