var superagent = require('superagent')

describe('drone-ai Backend Base', function () {
  
  before(function (done) {
    this.timeout(30000)
    setTimeout(done, 5000)
  });
  after(function(done) {
    superagent.get('http://localhost:8000/cluster-suicide/').end((err,res) => {
      return done()
    })
  })

  it('should listen on \'http://localhost:8000/\'', function (done) {
    superagent.get('http://localhost:8000/').end((err,res) => {
      if (!err && res.statusCode === 200) {
        return done()
      }
      return done('Fail with GET /')
    })
  })
  it('should parse JSON in POST', function(done) {
    superagent
      .post('http://localhost:8000/json/')
      .accept('application/json')
      .send({ name: 'Manny', species: 'cat' })
      .end((err,res) => {
        if (res.statusCode === 200 && res.body.name === "Manny" && res.body.species === 'cat') {
          return done()
        }
        return done('Fail parsing JSON in POST')
      })
  })
  it('should parse urlencoded in POST', function(done) {
    superagent
      .post('http://localhost:8000/json/')
      .type('form')
      .accept('application/json')
      .send('name=Manny')
      .send('species=cat')
      .end((err,res) => {
        if (res.statusCode === 200 && res.body.name === "Manny" && res.body.species === 'cat') {
          return done()
        }
        return done('Fail parsing JSON in POST')
      })
  })
})