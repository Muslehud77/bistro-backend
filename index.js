const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(
  process.env.PAYMENT_SECRET
);
const port = 5000;

//middleware 
app.use(cors());
app.use(express.json());




const uri = `mongodb+srv://${process.env.USER}:${process.env.PASS}@cluster0.q9bdeff.mongodb.net/?retryWrites=true&w=majority`;


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
  
    // await client.connect();


    const menuCollection = client.db("Bistro-Boss").collection("menu");
    const reviewsCollection = client.db("Bistro-Boss").collection("reviews");
    const cartCollection = client.db("Bistro-Boss").collection("cart");
    const userCollection = client.db("Bistro-Boss").collection("user");
    const paymentCollection = client.db("Bistro-Boss").collection("payments");

    //* middleware

    const verifyToken = (req, res, next) => {
       const authorization = req.headers.authorization;
       if(!authorization){
        return res.status(401).send({ message: 'Forbidden access' });
       }
       const token = authorization.split(' ')[1];
       jwt.verify(token,process.env.SECRET,(err,decoded)=>{
        if(err){
         return res.status(401).send({ message: "Forbidden access" });
        }
        req.decoded = decoded;
        next();
       })
       
    }

    const verifyAdmin = async(req, res, next) => {
      const email = req.decoded.email
      const result = await userCollection.findOne({email})
      const isAdmin = result?.role === "admin"
      if(!isAdmin){
        return res.status(403).send({ message: 'Forbidden access'})
      }
      next()
    }

    //*menu

    app.get('/menu',async(req,res)=>{
        try{
            const result = await menuCollection.find().toArray();
            res.send(result);
        }catch(err){

        }
    })

    app.get('/menu/:id',verifyToken,verifyAdmin,async(req,res)=>{
        try{
          const id = {_id:new ObjectId(req.params.id)}
            const result = await menuCollection.findOne(id)
            res.send(result);
        }catch(err){

        }
    })
    app.patch('/menu/edit/:id',verifyToken,verifyAdmin,async(req,res)=>{
        try{
          const id = {_id:new ObjectId(req.params.id)}
          const data = { $set: req.body }; 

            const result = await menuCollection.updateOne(id, data)
            
            res.send(result);
        }catch(err){

        }
    })

    app.delete('/menu/:id',verifyToken,verifyAdmin,async(req,res)=>{
     try{
      const id = {_id:new ObjectId(req.params.id)}
      const result = await menuCollection.deleteOne(id)
      res.send(result)
     }catch(err){

     }
      
    })


    app.get('/reviews',async(req,res)=>{
        try{
            const result = await reviewsCollection.find().toArray();
            res.send(result);
        }catch(err){

        }
    })

    app.post('/menu/add',verifyToken,verifyAdmin,async(req,res)=>{
      const item = req.body
      const result = await menuCollection.insertOne(item)
      res.send(result);
    })

    //*cart

    app.post('/cart',verifyToken,async(req,res)=>{
   
      const cart = req.body
      const result = await cartCollection.insertOne(cart)
      res.send(result)
    })

    app.get('/carts',verifyToken,async(req,res)=>{
    if(req.decoded.email === req.query.email){
      const query = {
        userEmail: req.query.email,
      };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    }
         
    })

    app.delete('/cart/:id',async(req,res)=>{
      const id = {_id:new ObjectId(req.params.id)}
      const result = await cartCollection.deleteOne(id)
      res.send(result)
    })

    //*user

    app.post("/user", async (req, res) => {
      const user = req.body;
      const query = { email: req.body.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ isExist: true });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users", verifyToken,verifyAdmin, async (req, res) => {
      // console.log(req.decoded);
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get('/user/admin/:email',verifyToken,async(req, res) => {
      try{
          const decoded = req.decoded;
      const email = req.params.email;
      if(decoded.email === email) {
         const result = await userCollection.findOne({ email });
         let admin = false
         if(result){
          admin = result.role === 'admin'
         }
         return res.send({admin});
      }
      res.status(403).send({message:'unauthorized'})
      }catch(err){
        console.log(err);
      }
    })

    app.patch('/user/:id',verifyToken,verifyAdmin,async(req,res)=>{
      const id = {_id: new ObjectId(req.params.id)}
      const updatedDoc = {
        $set:{
          role: 'admin',
        }
      }
      const result = await userCollection.updateOne(id, updatedDoc)
      res.send(result)
    })

    app.delete('/user/:id',verifyToken,verifyAdmin,async(req,res)=>{
      const id = {_id:new ObjectId(req.params.id)}
      const result = await userCollection.deleteOne(id)
      res.send(result)
    })

    //* jwt
    app.post('/jwt',async(req,res)=>{
      const user = req.body
      const token = jwt.sign(user, process.env.SECRET, { expiresIn: "5hr" });
      res.send({token})
    })

    //* payment intent
    app.post('/create-payment-intent',async(req,res)=>{
     try{
       const {price} = req.body
      const amount = parseInt(price*100)

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
     }catch(err){
      console.log(err);
     }
    })

app.post('/payments',async(req,res)=>{
  const paymentInfo = req.body
  const paymentResult = await paymentCollection.insertOne(paymentInfo)

  //deleting the cart items after the payment
  const query = {_id:{
    $in: paymentInfo.cartIds.map(id=> new ObjectId(id))
  }}

  const deleteCart = await cartCollection.deleteMany(query)

  res.send({paymentResult,deleteCart})
})

app.get('/paymentHistory',verifyToken,async(req,res)=>{
  if(req.query.email === req.decoded.email){
    const query = { email: req.query.email };
    const paymentHistory = await paymentCollection.find(query).toArray();
    res.send(paymentHistory);
  }


})

//* stats and Analytics.

app.get('/admin-stats',async(req,res)=>{

  const users = await userCollection.estimatedDocumentCount()
  const menuItems = await menuCollection.estimatedDocumentCount();
  const orders = await paymentCollection.estimatedDocumentCount()


  const pipeline = [
    {
      $group: {
        _id: null,
        totalRevenue : {$sum: '$amount'}
      }
    }
  ]

  const result = await paymentCollection.aggregate(pipeline).toArray()

  //this is not good practice


  // const payments = await paymentCollection.find().toArray();
  // const revenue = payments.reduce(
  //   (acc, payment) => acc + parseFloat(payment.amount),
  //   0
  // ).toFixed(2);
  // console.log(revenue); 
  const revenue = (result[0]?.totalRevenue || 0).toFixed(2);

res.send({
  users,
  menuItems,
  orders,
  revenue
});





})









    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);







app.get("/", (req, res) => {
  res.send("Boss is sitting");
});

app.listen(port, () => {
  console.log(`BistroBoss listening on port ${port}`);
});
