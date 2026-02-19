(function (de, zr) {
  typeof exports == "object" && typeof module < "u"
    ? zr(exports, require("ajv"))
    : typeof define == "function" && define.amd
      ? define(["exports", "ajv"], zr)
      : ((de = typeof globalThis < "u" ? globalThis : de || self),
        zr((de.VanillaSchemaForms = {}), de.Ajv));
})(this, function (de, zr) {
  "use strict";
  var yi = {},
    it = {};
  ((it.byteLength = Ga), (it.toByteArray = Ja), (it.fromByteArray = Za));
  for (
    var Ye = [],
      qe = [],
      Ha = typeof Uint8Array < "u" ? Uint8Array : Array,
      Pn = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
      Ir = 0,
      Wa = Pn.length;
    Ir < Wa;
    ++Ir
  )
    ((Ye[Ir] = Pn[Ir]), (qe[Pn.charCodeAt(Ir)] = Ir));
  ((qe[45] = 62), (qe[95] = 63));
  function gi(e) {
    var r = e.length;
    if (r % 4 > 0)
      throw new Error("Invalid string. Length must be a multiple of 4");
    var t = e.indexOf("=");
    t === -1 && (t = r);
    var n = t === r ? 0 : 4 - (t % 4);
    return [t, n];
  }
  function Ga(e) {
    var r = gi(e),
      t = r[0],
      n = r[1];
    return ((t + n) * 3) / 4 - n;
  }
  function Ya(e, r, t) {
    return ((r + t) * 3) / 4 - t;
  }
  function Ja(e) {
    var r,
      t = gi(e),
      n = t[0],
      i = t[1],
      o = new Ha(Ya(e, n, i)),
      s = 0,
      a = i > 0 ? n - 4 : n,
      u;
    for (u = 0; u < a; u += 4)
      ((r =
        (qe[e.charCodeAt(u)] << 18) |
        (qe[e.charCodeAt(u + 1)] << 12) |
        (qe[e.charCodeAt(u + 2)] << 6) |
        qe[e.charCodeAt(u + 3)]),
        (o[s++] = (r >> 16) & 255),
        (o[s++] = (r >> 8) & 255),
        (o[s++] = r & 255));
    return (
      i === 2 &&
        ((r = (qe[e.charCodeAt(u)] << 2) | (qe[e.charCodeAt(u + 1)] >> 4)),
        (o[s++] = r & 255)),
      i === 1 &&
        ((r =
          (qe[e.charCodeAt(u)] << 10) |
          (qe[e.charCodeAt(u + 1)] << 4) |
          (qe[e.charCodeAt(u + 2)] >> 2)),
        (o[s++] = (r >> 8) & 255),
        (o[s++] = r & 255)),
      o
    );
  }
  function Xa(e) {
    return (
      Ye[(e >> 18) & 63] + Ye[(e >> 12) & 63] + Ye[(e >> 6) & 63] + Ye[e & 63]
    );
  }
  function Qa(e, r, t) {
    for (var n, i = [], o = r; o < t; o += 3)
      ((n =
        ((e[o] << 16) & 16711680) +
        ((e[o + 1] << 8) & 65280) +
        (e[o + 2] & 255)),
        i.push(Xa(n)));
    return i.join("");
  }
  function Za(e) {
    for (
      var r, t = e.length, n = t % 3, i = [], o = 16383, s = 0, a = t - n;
      s < a;
      s += o
    )
      i.push(Qa(e, s, s + o > a ? a : s + o));
    return (
      n === 1
        ? ((r = e[t - 1]), i.push(Ye[r >> 2] + Ye[(r << 4) & 63] + "=="))
        : n === 2 &&
          ((r = (e[t - 2] << 8) + e[t - 1]),
          i.push(Ye[r >> 10] + Ye[(r >> 4) & 63] + Ye[(r << 2) & 63] + "=")),
      i.join("")
    );
  }
  var An = {};
  ((An.read = function (e, r, t, n, i) {
    var o,
      s,
      a = i * 8 - n - 1,
      u = (1 << a) - 1,
      d = u >> 1,
      c = -7,
      g = t ? i - 1 : 0,
      h = t ? -1 : 1,
      p = e[r + g];
    for (
      g += h, o = p & ((1 << -c) - 1), p >>= -c, c += a;
      c > 0;
      o = o * 256 + e[r + g], g += h, c -= 8
    );
    for (
      s = o & ((1 << -c) - 1), o >>= -c, c += n;
      c > 0;
      s = s * 256 + e[r + g], g += h, c -= 8
    );
    if (o === 0) o = 1 - d;
    else {
      if (o === u) return s ? NaN : (p ? -1 : 1) * (1 / 0);
      ((s = s + Math.pow(2, n)), (o = o - d));
    }
    return (p ? -1 : 1) * s * Math.pow(2, o - n);
  }),
    (An.write = function (e, r, t, n, i, o) {
      var s,
        a,
        u,
        d = o * 8 - i - 1,
        c = (1 << d) - 1,
        g = c >> 1,
        h = i === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0,
        p = n ? 0 : o - 1,
        v = n ? 1 : -1,
        w = r < 0 || (r === 0 && 1 / r < 0) ? 1 : 0;
      for (
        r = Math.abs(r),
          isNaN(r) || r === 1 / 0
            ? ((a = isNaN(r) ? 1 : 0), (s = c))
            : ((s = Math.floor(Math.log(r) / Math.LN2)),
              r * (u = Math.pow(2, -s)) < 1 && (s--, (u *= 2)),
              s + g >= 1 ? (r += h / u) : (r += h * Math.pow(2, 1 - g)),
              r * u >= 2 && (s++, (u /= 2)),
              s + g >= c
                ? ((a = 0), (s = c))
                : s + g >= 1
                  ? ((a = (r * u - 1) * Math.pow(2, i)), (s = s + g))
                  : ((a = r * Math.pow(2, g - 1) * Math.pow(2, i)), (s = 0)));
        i >= 8;
        e[t + p] = a & 255, p += v, a /= 256, i -= 8
      );
      for (
        s = (s << i) | a, d += i;
        d > 0;
        e[t + p] = s & 255, p += v, s /= 256, d -= 8
      );
      e[t + p - v] |= w * 128;
    }));
  (function (e) {
    const r = it,
      t = An,
      n =
        typeof Symbol == "function" && typeof Symbol.for == "function"
          ? Symbol.for("nodejs.util.inspect.custom")
          : null;
    ((e.Buffer = c), (e.SlowBuffer = b), (e.INSPECT_MAX_BYTES = 50));
    const i = 2147483647;
    e.kMaxLength = i;
    const { Uint8Array: o, ArrayBuffer: s, SharedArrayBuffer: a } = globalThis;
    ((c.TYPED_ARRAY_SUPPORT = u()),
      !c.TYPED_ARRAY_SUPPORT &&
        typeof console < "u" &&
        typeof console.error == "function" &&
        console.error(
          "This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support.",
        ));
    function u() {
      try {
        const E = new o(1),
          l = {
            foo: function () {
              return 42;
            },
          };
        return (
          Object.setPrototypeOf(l, o.prototype),
          Object.setPrototypeOf(E, l),
          E.foo() === 42
        );
      } catch {
        return !1;
      }
    }
    (Object.defineProperty(c.prototype, "parent", {
      enumerable: !0,
      get: function () {
        if (c.isBuffer(this)) return this.buffer;
      },
    }),
      Object.defineProperty(c.prototype, "offset", {
        enumerable: !0,
        get: function () {
          if (c.isBuffer(this)) return this.byteOffset;
        },
      }));
    function d(E) {
      if (E > i)
        throw new RangeError(
          'The value "' + E + '" is invalid for option "size"',
        );
      const l = new o(E);
      return (Object.setPrototypeOf(l, c.prototype), l);
    }
    function c(E, l, f) {
      if (typeof E == "number") {
        if (typeof l == "string")
          throw new TypeError(
            'The "string" argument must be of type string. Received type number',
          );
        return v(E);
      }
      return g(E, l, f);
    }
    c.poolSize = 8192;
    function g(E, l, f) {
      if (typeof E == "string") return w(E, l);
      if (s.isView(E)) return _(E);
      if (E == null)
        throw new TypeError(
          "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " +
            typeof E,
        );
      if (
        je(E, s) ||
        (E && je(E.buffer, s)) ||
        (typeof a < "u" && (je(E, a) || (E && je(E.buffer, a))))
      )
        return m(E, l, f);
      if (typeof E == "number")
        throw new TypeError(
          'The "value" argument must not be of type number. Received type number',
        );
      const I = E.valueOf && E.valueOf();
      if (I != null && I !== E) return c.from(I, l, f);
      const N = $(E);
      if (N) return N;
      if (
        typeof Symbol < "u" &&
        Symbol.toPrimitive != null &&
        typeof E[Symbol.toPrimitive] == "function"
      )
        return c.from(E[Symbol.toPrimitive]("string"), l, f);
      throw new TypeError(
        "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " +
          typeof E,
      );
    }
    ((c.from = function (E, l, f) {
      return g(E, l, f);
    }),
      Object.setPrototypeOf(c.prototype, o.prototype),
      Object.setPrototypeOf(c, o));
    function h(E) {
      if (typeof E != "number")
        throw new TypeError('"size" argument must be of type number');
      if (E < 0)
        throw new RangeError(
          'The value "' + E + '" is invalid for option "size"',
        );
    }
    function p(E, l, f) {
      return (
        h(E),
        E <= 0
          ? d(E)
          : l !== void 0
            ? typeof f == "string"
              ? d(E).fill(l, f)
              : d(E).fill(l)
            : d(E)
      );
    }
    c.alloc = function (E, l, f) {
      return p(E, l, f);
    };
    function v(E) {
      return (h(E), d(E < 0 ? 0 : P(E) | 0));
    }
    ((c.allocUnsafe = function (E) {
      return v(E);
    }),
      (c.allocUnsafeSlow = function (E) {
        return v(E);
      }));
    function w(E, l) {
      if (
        ((typeof l != "string" || l === "") && (l = "utf8"), !c.isEncoding(l))
      )
        throw new TypeError("Unknown encoding: " + l);
      const f = A(E, l) | 0;
      let I = d(f);
      const N = I.write(E, l);
      return (N !== f && (I = I.slice(0, N)), I);
    }
    function y(E) {
      const l = E.length < 0 ? 0 : P(E.length) | 0,
        f = d(l);
      for (let I = 0; I < l; I += 1) f[I] = E[I] & 255;
      return f;
    }
    function _(E) {
      if (je(E, o)) {
        const l = new o(E);
        return m(l.buffer, l.byteOffset, l.byteLength);
      }
      return y(E);
    }
    function m(E, l, f) {
      if (l < 0 || E.byteLength < l)
        throw new RangeError('"offset" is outside of buffer bounds');
      if (E.byteLength < l + (f || 0))
        throw new RangeError('"length" is outside of buffer bounds');
      let I;
      return (
        l === void 0 && f === void 0
          ? (I = new o(E))
          : f === void 0
            ? (I = new o(E, l))
            : (I = new o(E, l, f)),
        Object.setPrototypeOf(I, c.prototype),
        I
      );
    }
    function $(E) {
      if (c.isBuffer(E)) {
        const l = P(E.length) | 0,
          f = d(l);
        return (f.length === 0 || E.copy(f, 0, 0, l), f);
      }
      if (E.length !== void 0)
        return typeof E.length != "number" || lr(E.length) ? d(0) : y(E);
      if (E.type === "Buffer" && Array.isArray(E.data)) return y(E.data);
    }
    function P(E) {
      if (E >= i)
        throw new RangeError(
          "Attempt to allocate Buffer larger than maximum size: 0x" +
            i.toString(16) +
            " bytes",
        );
      return E | 0;
    }
    function b(E) {
      return (+E != E && (E = 0), c.alloc(+E));
    }
    ((c.isBuffer = function (l) {
      return l != null && l._isBuffer === !0 && l !== c.prototype;
    }),
      (c.compare = function (l, f) {
        if (
          (je(l, o) && (l = c.from(l, l.offset, l.byteLength)),
          je(f, o) && (f = c.from(f, f.offset, f.byteLength)),
          !c.isBuffer(l) || !c.isBuffer(f))
        )
          throw new TypeError(
            'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array',
          );
        if (l === f) return 0;
        let I = l.length,
          N = f.length;
        for (let j = 0, q = Math.min(I, N); j < q; ++j)
          if (l[j] !== f[j]) {
            ((I = l[j]), (N = f[j]));
            break;
          }
        return I < N ? -1 : N < I ? 1 : 0;
      }),
      (c.isEncoding = function (l) {
        switch (String(l).toLowerCase()) {
          case "hex":
          case "utf8":
          case "utf-8":
          case "ascii":
          case "latin1":
          case "binary":
          case "base64":
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return !0;
          default:
            return !1;
        }
      }),
      (c.concat = function (l, f) {
        if (!Array.isArray(l))
          throw new TypeError('"list" argument must be an Array of Buffers');
        if (l.length === 0) return c.alloc(0);
        let I;
        if (f === void 0)
          for (f = 0, I = 0; I < l.length; ++I) f += l[I].length;
        const N = c.allocUnsafe(f);
        let j = 0;
        for (I = 0; I < l.length; ++I) {
          let q = l[I];
          if (je(q, o))
            j + q.length > N.length
              ? (c.isBuffer(q) || (q = c.from(q)), q.copy(N, j))
              : o.prototype.set.call(N, q, j);
          else if (c.isBuffer(q)) q.copy(N, j);
          else
            throw new TypeError('"list" argument must be an Array of Buffers');
          j += q.length;
        }
        return N;
      }));
    function A(E, l) {
      if (c.isBuffer(E)) return E.length;
      if (s.isView(E) || je(E, s)) return E.byteLength;
      if (typeof E != "string")
        throw new TypeError(
          'The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type ' +
            typeof E,
        );
      const f = E.length,
        I = arguments.length > 2 && arguments[2] === !0;
      if (!I && f === 0) return 0;
      let N = !1;
      for (;;)
        switch (l) {
          case "ascii":
          case "latin1":
          case "binary":
            return f;
          case "utf8":
          case "utf-8":
            return Ee(E).length;
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return f * 2;
          case "hex":
            return f >>> 1;
          case "base64":
            return Te(E).length;
          default:
            if (N) return I ? -1 : Ee(E).length;
            ((l = ("" + l).toLowerCase()), (N = !0));
        }
    }
    c.byteLength = A;
    function O(E, l, f) {
      let I = !1;
      if (
        ((l === void 0 || l < 0) && (l = 0),
        l > this.length ||
          ((f === void 0 || f > this.length) && (f = this.length), f <= 0) ||
          ((f >>>= 0), (l >>>= 0), f <= l))
      )
        return "";
      for (E || (E = "utf8"); ; )
        switch (E) {
          case "hex":
            return U(this, l, f);
          case "utf8":
          case "utf-8":
            return be(this, l, f);
          case "ascii":
            return z(this, l, f);
          case "latin1":
          case "binary":
            return k(this, l, f);
          case "base64":
            return Ie(this, l, f);
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return C(this, l, f);
          default:
            if (I) throw new TypeError("Unknown encoding: " + E);
            ((E = (E + "").toLowerCase()), (I = !0));
        }
    }
    c.prototype._isBuffer = !0;
    function F(E, l, f) {
      const I = E[l];
      ((E[l] = E[f]), (E[f] = I));
    }
    ((c.prototype.swap16 = function () {
      const l = this.length;
      if (l % 2 !== 0)
        throw new RangeError("Buffer size must be a multiple of 16-bits");
      for (let f = 0; f < l; f += 2) F(this, f, f + 1);
      return this;
    }),
      (c.prototype.swap32 = function () {
        const l = this.length;
        if (l % 4 !== 0)
          throw new RangeError("Buffer size must be a multiple of 32-bits");
        for (let f = 0; f < l; f += 4)
          (F(this, f, f + 3), F(this, f + 1, f + 2));
        return this;
      }),
      (c.prototype.swap64 = function () {
        const l = this.length;
        if (l % 8 !== 0)
          throw new RangeError("Buffer size must be a multiple of 64-bits");
        for (let f = 0; f < l; f += 8)
          (F(this, f, f + 7),
            F(this, f + 1, f + 6),
            F(this, f + 2, f + 5),
            F(this, f + 3, f + 4));
        return this;
      }),
      (c.prototype.toString = function () {
        const l = this.length;
        return l === 0
          ? ""
          : arguments.length === 0
            ? be(this, 0, l)
            : O.apply(this, arguments);
      }),
      (c.prototype.toLocaleString = c.prototype.toString),
      (c.prototype.equals = function (l) {
        if (!c.isBuffer(l)) throw new TypeError("Argument must be a Buffer");
        return this === l ? !0 : c.compare(this, l) === 0;
      }),
      (c.prototype.inspect = function () {
        let l = "";
        const f = e.INSPECT_MAX_BYTES;
        return (
          (l = this.toString("hex", 0, f)
            .replace(/(.{2})/g, "$1 ")
            .trim()),
          this.length > f && (l += " ... "),
          "<Buffer " + l + ">"
        );
      }),
      n && (c.prototype[n] = c.prototype.inspect),
      (c.prototype.compare = function (l, f, I, N, j) {
        if (
          (je(l, o) && (l = c.from(l, l.offset, l.byteLength)), !c.isBuffer(l))
        )
          throw new TypeError(
            'The "target" argument must be one of type Buffer or Uint8Array. Received type ' +
              typeof l,
          );
        if (
          (f === void 0 && (f = 0),
          I === void 0 && (I = l ? l.length : 0),
          N === void 0 && (N = 0),
          j === void 0 && (j = this.length),
          f < 0 || I > l.length || N < 0 || j > this.length)
        )
          throw new RangeError("out of range index");
        if (N >= j && f >= I) return 0;
        if (N >= j) return -1;
        if (f >= I) return 1;
        if (((f >>>= 0), (I >>>= 0), (N >>>= 0), (j >>>= 0), this === l))
          return 0;
        let q = j - N,
          ae = I - f;
        const ye = Math.min(q, ae),
          he = this.slice(N, j),
          ge = l.slice(f, I);
        for (let pe = 0; pe < ye; ++pe)
          if (he[pe] !== ge[pe]) {
            ((q = he[pe]), (ae = ge[pe]));
            break;
          }
        return q < ae ? -1 : ae < q ? 1 : 0;
      }));
    function V(E, l, f, I, N) {
      if (E.length === 0) return -1;
      if (
        (typeof f == "string"
          ? ((I = f), (f = 0))
          : f > 2147483647
            ? (f = 2147483647)
            : f < -2147483648 && (f = -2147483648),
        (f = +f),
        lr(f) && (f = N ? 0 : E.length - 1),
        f < 0 && (f = E.length + f),
        f >= E.length)
      ) {
        if (N) return -1;
        f = E.length - 1;
      } else if (f < 0)
        if (N) f = 0;
        else return -1;
      if ((typeof l == "string" && (l = c.from(l, I)), c.isBuffer(l)))
        return l.length === 0 ? -1 : G(E, l, f, I, N);
      if (typeof l == "number")
        return (
          (l = l & 255),
          typeof o.prototype.indexOf == "function"
            ? N
              ? o.prototype.indexOf.call(E, l, f)
              : o.prototype.lastIndexOf.call(E, l, f)
            : G(E, [l], f, I, N)
        );
      throw new TypeError("val must be string, number or Buffer");
    }
    function G(E, l, f, I, N) {
      let j = 1,
        q = E.length,
        ae = l.length;
      if (
        I !== void 0 &&
        ((I = String(I).toLowerCase()),
        I === "ucs2" || I === "ucs-2" || I === "utf16le" || I === "utf-16le")
      ) {
        if (E.length < 2 || l.length < 2) return -1;
        ((j = 2), (q /= 2), (ae /= 2), (f /= 2));
      }
      function ye(ge, pe) {
        return j === 1 ? ge[pe] : ge.readUInt16BE(pe * j);
      }
      let he;
      if (N) {
        let ge = -1;
        for (he = f; he < q; he++)
          if (ye(E, he) === ye(l, ge === -1 ? 0 : he - ge)) {
            if ((ge === -1 && (ge = he), he - ge + 1 === ae)) return ge * j;
          } else (ge !== -1 && (he -= he - ge), (ge = -1));
      } else
        for (f + ae > q && (f = q - ae), he = f; he >= 0; he--) {
          let ge = !0;
          for (let pe = 0; pe < ae; pe++)
            if (ye(E, he + pe) !== ye(l, pe)) {
              ge = !1;
              break;
            }
          if (ge) return he;
        }
      return -1;
    }
    ((c.prototype.includes = function (l, f, I) {
      return this.indexOf(l, f, I) !== -1;
    }),
      (c.prototype.indexOf = function (l, f, I) {
        return V(this, l, f, I, !0);
      }),
      (c.prototype.lastIndexOf = function (l, f, I) {
        return V(this, l, f, I, !1);
      }));
    function L(E, l, f, I) {
      f = Number(f) || 0;
      const N = E.length - f;
      I ? ((I = Number(I)), I > N && (I = N)) : (I = N);
      const j = l.length;
      I > j / 2 && (I = j / 2);
      let q;
      for (q = 0; q < I; ++q) {
        const ae = parseInt(l.substr(q * 2, 2), 16);
        if (lr(ae)) return q;
        E[f + q] = ae;
      }
      return q;
    }
    function W(E, l, f, I) {
      return _r(Ee(l, E.length - f), E, f, I);
    }
    function Y(E, l, f, I) {
      return _r(we(l), E, f, I);
    }
    function J(E, l, f, I) {
      return _r(Te(l), E, f, I);
    }
    function le(E, l, f, I) {
      return _r(vr(l, E.length - f), E, f, I);
    }
    ((c.prototype.write = function (l, f, I, N) {
      if (f === void 0) ((N = "utf8"), (I = this.length), (f = 0));
      else if (I === void 0 && typeof f == "string")
        ((N = f), (I = this.length), (f = 0));
      else if (isFinite(f))
        ((f = f >>> 0),
          isFinite(I)
            ? ((I = I >>> 0), N === void 0 && (N = "utf8"))
            : ((N = I), (I = void 0)));
      else
        throw new Error(
          "Buffer.write(string, encoding, offset[, length]) is no longer supported",
        );
      const j = this.length - f;
      if (
        ((I === void 0 || I > j) && (I = j),
        (l.length > 0 && (I < 0 || f < 0)) || f > this.length)
      )
        throw new RangeError("Attempt to write outside buffer bounds");
      N || (N = "utf8");
      let q = !1;
      for (;;)
        switch (N) {
          case "hex":
            return L(this, l, f, I);
          case "utf8":
          case "utf-8":
            return W(this, l, f, I);
          case "ascii":
          case "latin1":
          case "binary":
            return Y(this, l, f, I);
          case "base64":
            return J(this, l, f, I);
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return le(this, l, f, I);
          default:
            if (q) throw new TypeError("Unknown encoding: " + N);
            ((N = ("" + N).toLowerCase()), (q = !0));
        }
    }),
      (c.prototype.toJSON = function () {
        return {
          type: "Buffer",
          data: Array.prototype.slice.call(this._arr || this, 0),
        };
      }));
    function Ie(E, l, f) {
      return l === 0 && f === E.length
        ? r.fromByteArray(E)
        : r.fromByteArray(E.slice(l, f));
    }
    function be(E, l, f) {
      f = Math.min(E.length, f);
      const I = [];
      let N = l;
      for (; N < f; ) {
        const j = E[N];
        let q = null,
          ae = j > 239 ? 4 : j > 223 ? 3 : j > 191 ? 2 : 1;
        if (N + ae <= f) {
          let ye, he, ge, pe;
          switch (ae) {
            case 1:
              j < 128 && (q = j);
              break;
            case 2:
              ((ye = E[N + 1]),
                (ye & 192) === 128 &&
                  ((pe = ((j & 31) << 6) | (ye & 63)), pe > 127 && (q = pe)));
              break;
            case 3:
              ((ye = E[N + 1]),
                (he = E[N + 2]),
                (ye & 192) === 128 &&
                  (he & 192) === 128 &&
                  ((pe = ((j & 15) << 12) | ((ye & 63) << 6) | (he & 63)),
                  pe > 2047 && (pe < 55296 || pe > 57343) && (q = pe)));
              break;
            case 4:
              ((ye = E[N + 1]),
                (he = E[N + 2]),
                (ge = E[N + 3]),
                (ye & 192) === 128 &&
                  (he & 192) === 128 &&
                  (ge & 192) === 128 &&
                  ((pe =
                    ((j & 15) << 18) |
                    ((ye & 63) << 12) |
                    ((he & 63) << 6) |
                    (ge & 63)),
                  pe > 65535 && pe < 1114112 && (q = pe)));
          }
        }
        (q === null
          ? ((q = 65533), (ae = 1))
          : q > 65535 &&
            ((q -= 65536),
            I.push(((q >>> 10) & 1023) | 55296),
            (q = 56320 | (q & 1023))),
          I.push(q),
          (N += ae));
      }
      return De(I);
    }
    const ue = 4096;
    function De(E) {
      const l = E.length;
      if (l <= ue) return String.fromCharCode.apply(String, E);
      let f = "",
        I = 0;
      for (; I < l; )
        f += String.fromCharCode.apply(String, E.slice(I, (I += ue)));
      return f;
    }
    function z(E, l, f) {
      let I = "";
      f = Math.min(E.length, f);
      for (let N = l; N < f; ++N) I += String.fromCharCode(E[N] & 127);
      return I;
    }
    function k(E, l, f) {
      let I = "";
      f = Math.min(E.length, f);
      for (let N = l; N < f; ++N) I += String.fromCharCode(E[N]);
      return I;
    }
    function U(E, l, f) {
      const I = E.length;
      ((!l || l < 0) && (l = 0), (!f || f < 0 || f > I) && (f = I));
      let N = "";
      for (let j = l; j < f; ++j) N += nt[E[j]];
      return N;
    }
    function C(E, l, f) {
      const I = E.slice(l, f);
      let N = "";
      for (let j = 0; j < I.length - 1; j += 2)
        N += String.fromCharCode(I[j] + I[j + 1] * 256);
      return N;
    }
    c.prototype.slice = function (l, f) {
      const I = this.length;
      ((l = ~~l),
        (f = f === void 0 ? I : ~~f),
        l < 0 ? ((l += I), l < 0 && (l = 0)) : l > I && (l = I),
        f < 0 ? ((f += I), f < 0 && (f = 0)) : f > I && (f = I),
        f < l && (f = l));
      const N = this.subarray(l, f);
      return (Object.setPrototypeOf(N, c.prototype), N);
    };
    function S(E, l, f) {
      if (E % 1 !== 0 || E < 0) throw new RangeError("offset is not uint");
      if (E + l > f)
        throw new RangeError("Trying to access beyond buffer length");
    }
    ((c.prototype.readUintLE = c.prototype.readUIntLE =
      function (l, f, I) {
        ((l = l >>> 0), (f = f >>> 0), I || S(l, f, this.length));
        let N = this[l],
          j = 1,
          q = 0;
        for (; ++q < f && (j *= 256); ) N += this[l + q] * j;
        return N;
      }),
      (c.prototype.readUintBE = c.prototype.readUIntBE =
        function (l, f, I) {
          ((l = l >>> 0), (f = f >>> 0), I || S(l, f, this.length));
          let N = this[l + --f],
            j = 1;
          for (; f > 0 && (j *= 256); ) N += this[l + --f] * j;
          return N;
        }),
      (c.prototype.readUint8 = c.prototype.readUInt8 =
        function (l, f) {
          return ((l = l >>> 0), f || S(l, 1, this.length), this[l]);
        }),
      (c.prototype.readUint16LE = c.prototype.readUInt16LE =
        function (l, f) {
          return (
            (l = l >>> 0),
            f || S(l, 2, this.length),
            this[l] | (this[l + 1] << 8)
          );
        }),
      (c.prototype.readUint16BE = c.prototype.readUInt16BE =
        function (l, f) {
          return (
            (l = l >>> 0),
            f || S(l, 2, this.length),
            (this[l] << 8) | this[l + 1]
          );
        }),
      (c.prototype.readUint32LE = c.prototype.readUInt32LE =
        function (l, f) {
          return (
            (l = l >>> 0),
            f || S(l, 4, this.length),
            (this[l] | (this[l + 1] << 8) | (this[l + 2] << 16)) +
              this[l + 3] * 16777216
          );
        }),
      (c.prototype.readUint32BE = c.prototype.readUInt32BE =
        function (l, f) {
          return (
            (l = l >>> 0),
            f || S(l, 4, this.length),
            this[l] * 16777216 +
              ((this[l + 1] << 16) | (this[l + 2] << 8) | this[l + 3])
          );
        }),
      (c.prototype.readBigUInt64LE = Ge(function (l) {
        ((l = l >>> 0), re(l, "offset"));
        const f = this[l],
          I = this[l + 7];
        (f === void 0 || I === void 0) && me(l, this.length - 8);
        const N =
            f + this[++l] * 2 ** 8 + this[++l] * 2 ** 16 + this[++l] * 2 ** 24,
          j =
            this[++l] + this[++l] * 2 ** 8 + this[++l] * 2 ** 16 + I * 2 ** 24;
        return BigInt(N) + (BigInt(j) << BigInt(32));
      })),
      (c.prototype.readBigUInt64BE = Ge(function (l) {
        ((l = l >>> 0), re(l, "offset"));
        const f = this[l],
          I = this[l + 7];
        (f === void 0 || I === void 0) && me(l, this.length - 8);
        const N =
            f * 2 ** 24 + this[++l] * 2 ** 16 + this[++l] * 2 ** 8 + this[++l],
          j =
            this[++l] * 2 ** 24 + this[++l] * 2 ** 16 + this[++l] * 2 ** 8 + I;
        return (BigInt(N) << BigInt(32)) + BigInt(j);
      })),
      (c.prototype.readIntLE = function (l, f, I) {
        ((l = l >>> 0), (f = f >>> 0), I || S(l, f, this.length));
        let N = this[l],
          j = 1,
          q = 0;
        for (; ++q < f && (j *= 256); ) N += this[l + q] * j;
        return ((j *= 128), N >= j && (N -= Math.pow(2, 8 * f)), N);
      }),
      (c.prototype.readIntBE = function (l, f, I) {
        ((l = l >>> 0), (f = f >>> 0), I || S(l, f, this.length));
        let N = f,
          j = 1,
          q = this[l + --N];
        for (; N > 0 && (j *= 256); ) q += this[l + --N] * j;
        return ((j *= 128), q >= j && (q -= Math.pow(2, 8 * f)), q);
      }),
      (c.prototype.readInt8 = function (l, f) {
        return (
          (l = l >>> 0),
          f || S(l, 1, this.length),
          this[l] & 128 ? (255 - this[l] + 1) * -1 : this[l]
        );
      }),
      (c.prototype.readInt16LE = function (l, f) {
        ((l = l >>> 0), f || S(l, 2, this.length));
        const I = this[l] | (this[l + 1] << 8);
        return I & 32768 ? I | 4294901760 : I;
      }),
      (c.prototype.readInt16BE = function (l, f) {
        ((l = l >>> 0), f || S(l, 2, this.length));
        const I = this[l + 1] | (this[l] << 8);
        return I & 32768 ? I | 4294901760 : I;
      }),
      (c.prototype.readInt32LE = function (l, f) {
        return (
          (l = l >>> 0),
          f || S(l, 4, this.length),
          this[l] |
            (this[l + 1] << 8) |
            (this[l + 2] << 16) |
            (this[l + 3] << 24)
        );
      }),
      (c.prototype.readInt32BE = function (l, f) {
        return (
          (l = l >>> 0),
          f || S(l, 4, this.length),
          (this[l] << 24) |
            (this[l + 1] << 16) |
            (this[l + 2] << 8) |
            this[l + 3]
        );
      }),
      (c.prototype.readBigInt64LE = Ge(function (l) {
        ((l = l >>> 0), re(l, "offset"));
        const f = this[l],
          I = this[l + 7];
        (f === void 0 || I === void 0) && me(l, this.length - 8);
        const N =
          this[l + 4] +
          this[l + 5] * 2 ** 8 +
          this[l + 6] * 2 ** 16 +
          (I << 24);
        return (
          (BigInt(N) << BigInt(32)) +
          BigInt(
            f + this[++l] * 2 ** 8 + this[++l] * 2 ** 16 + this[++l] * 2 ** 24,
          )
        );
      })),
      (c.prototype.readBigInt64BE = Ge(function (l) {
        ((l = l >>> 0), re(l, "offset"));
        const f = this[l],
          I = this[l + 7];
        (f === void 0 || I === void 0) && me(l, this.length - 8);
        const N =
          (f << 24) + this[++l] * 2 ** 16 + this[++l] * 2 ** 8 + this[++l];
        return (
          (BigInt(N) << BigInt(32)) +
          BigInt(
            this[++l] * 2 ** 24 + this[++l] * 2 ** 16 + this[++l] * 2 ** 8 + I,
          )
        );
      })),
      (c.prototype.readFloatLE = function (l, f) {
        return (
          (l = l >>> 0),
          f || S(l, 4, this.length),
          t.read(this, l, !0, 23, 4)
        );
      }),
      (c.prototype.readFloatBE = function (l, f) {
        return (
          (l = l >>> 0),
          f || S(l, 4, this.length),
          t.read(this, l, !1, 23, 4)
        );
      }),
      (c.prototype.readDoubleLE = function (l, f) {
        return (
          (l = l >>> 0),
          f || S(l, 8, this.length),
          t.read(this, l, !0, 52, 8)
        );
      }),
      (c.prototype.readDoubleBE = function (l, f) {
        return (
          (l = l >>> 0),
          f || S(l, 8, this.length),
          t.read(this, l, !1, 52, 8)
        );
      }));
    function R(E, l, f, I, N, j) {
      if (!c.isBuffer(E))
        throw new TypeError('"buffer" argument must be a Buffer instance');
      if (l > N || l < j)
        throw new RangeError('"value" argument is out of bounds');
      if (f + I > E.length) throw new RangeError("Index out of range");
    }
    ((c.prototype.writeUintLE = c.prototype.writeUIntLE =
      function (l, f, I, N) {
        if (((l = +l), (f = f >>> 0), (I = I >>> 0), !N)) {
          const ae = Math.pow(2, 8 * I) - 1;
          R(this, l, f, I, ae, 0);
        }
        let j = 1,
          q = 0;
        for (this[f] = l & 255; ++q < I && (j *= 256); )
          this[f + q] = (l / j) & 255;
        return f + I;
      }),
      (c.prototype.writeUintBE = c.prototype.writeUIntBE =
        function (l, f, I, N) {
          if (((l = +l), (f = f >>> 0), (I = I >>> 0), !N)) {
            const ae = Math.pow(2, 8 * I) - 1;
            R(this, l, f, I, ae, 0);
          }
          let j = I - 1,
            q = 1;
          for (this[f + j] = l & 255; --j >= 0 && (q *= 256); )
            this[f + j] = (l / q) & 255;
          return f + I;
        }),
      (c.prototype.writeUint8 = c.prototype.writeUInt8 =
        function (l, f, I) {
          return (
            (l = +l),
            (f = f >>> 0),
            I || R(this, l, f, 1, 255, 0),
            (this[f] = l & 255),
            f + 1
          );
        }),
      (c.prototype.writeUint16LE = c.prototype.writeUInt16LE =
        function (l, f, I) {
          return (
            (l = +l),
            (f = f >>> 0),
            I || R(this, l, f, 2, 65535, 0),
            (this[f] = l & 255),
            (this[f + 1] = l >>> 8),
            f + 2
          );
        }),
      (c.prototype.writeUint16BE = c.prototype.writeUInt16BE =
        function (l, f, I) {
          return (
            (l = +l),
            (f = f >>> 0),
            I || R(this, l, f, 2, 65535, 0),
            (this[f] = l >>> 8),
            (this[f + 1] = l & 255),
            f + 2
          );
        }),
      (c.prototype.writeUint32LE = c.prototype.writeUInt32LE =
        function (l, f, I) {
          return (
            (l = +l),
            (f = f >>> 0),
            I || R(this, l, f, 4, 4294967295, 0),
            (this[f + 3] = l >>> 24),
            (this[f + 2] = l >>> 16),
            (this[f + 1] = l >>> 8),
            (this[f] = l & 255),
            f + 4
          );
        }),
      (c.prototype.writeUint32BE = c.prototype.writeUInt32BE =
        function (l, f, I) {
          return (
            (l = +l),
            (f = f >>> 0),
            I || R(this, l, f, 4, 4294967295, 0),
            (this[f] = l >>> 24),
            (this[f + 1] = l >>> 16),
            (this[f + 2] = l >>> 8),
            (this[f + 3] = l & 255),
            f + 4
          );
        }));
    function M(E, l, f, I, N) {
      Q(l, I, N, E, f, 7);
      let j = Number(l & BigInt(4294967295));
      ((E[f++] = j),
        (j = j >> 8),
        (E[f++] = j),
        (j = j >> 8),
        (E[f++] = j),
        (j = j >> 8),
        (E[f++] = j));
      let q = Number((l >> BigInt(32)) & BigInt(4294967295));
      return (
        (E[f++] = q),
        (q = q >> 8),
        (E[f++] = q),
        (q = q >> 8),
        (E[f++] = q),
        (q = q >> 8),
        (E[f++] = q),
        f
      );
    }
    function X(E, l, f, I, N) {
      Q(l, I, N, E, f, 7);
      let j = Number(l & BigInt(4294967295));
      ((E[f + 7] = j),
        (j = j >> 8),
        (E[f + 6] = j),
        (j = j >> 8),
        (E[f + 5] = j),
        (j = j >> 8),
        (E[f + 4] = j));
      let q = Number((l >> BigInt(32)) & BigInt(4294967295));
      return (
        (E[f + 3] = q),
        (q = q >> 8),
        (E[f + 2] = q),
        (q = q >> 8),
        (E[f + 1] = q),
        (q = q >> 8),
        (E[f] = q),
        f + 8
      );
    }
    ((c.prototype.writeBigUInt64LE = Ge(function (l, f = 0) {
      return M(this, l, f, BigInt(0), BigInt("0xffffffffffffffff"));
    })),
      (c.prototype.writeBigUInt64BE = Ge(function (l, f = 0) {
        return X(this, l, f, BigInt(0), BigInt("0xffffffffffffffff"));
      })),
      (c.prototype.writeIntLE = function (l, f, I, N) {
        if (((l = +l), (f = f >>> 0), !N)) {
          const ye = Math.pow(2, 8 * I - 1);
          R(this, l, f, I, ye - 1, -ye);
        }
        let j = 0,
          q = 1,
          ae = 0;
        for (this[f] = l & 255; ++j < I && (q *= 256); )
          (l < 0 && ae === 0 && this[f + j - 1] !== 0 && (ae = 1),
            (this[f + j] = (((l / q) >> 0) - ae) & 255));
        return f + I;
      }),
      (c.prototype.writeIntBE = function (l, f, I, N) {
        if (((l = +l), (f = f >>> 0), !N)) {
          const ye = Math.pow(2, 8 * I - 1);
          R(this, l, f, I, ye - 1, -ye);
        }
        let j = I - 1,
          q = 1,
          ae = 0;
        for (this[f + j] = l & 255; --j >= 0 && (q *= 256); )
          (l < 0 && ae === 0 && this[f + j + 1] !== 0 && (ae = 1),
            (this[f + j] = (((l / q) >> 0) - ae) & 255));
        return f + I;
      }),
      (c.prototype.writeInt8 = function (l, f, I) {
        return (
          (l = +l),
          (f = f >>> 0),
          I || R(this, l, f, 1, 127, -128),
          l < 0 && (l = 255 + l + 1),
          (this[f] = l & 255),
          f + 1
        );
      }),
      (c.prototype.writeInt16LE = function (l, f, I) {
        return (
          (l = +l),
          (f = f >>> 0),
          I || R(this, l, f, 2, 32767, -32768),
          (this[f] = l & 255),
          (this[f + 1] = l >>> 8),
          f + 2
        );
      }),
      (c.prototype.writeInt16BE = function (l, f, I) {
        return (
          (l = +l),
          (f = f >>> 0),
          I || R(this, l, f, 2, 32767, -32768),
          (this[f] = l >>> 8),
          (this[f + 1] = l & 255),
          f + 2
        );
      }),
      (c.prototype.writeInt32LE = function (l, f, I) {
        return (
          (l = +l),
          (f = f >>> 0),
          I || R(this, l, f, 4, 2147483647, -2147483648),
          (this[f] = l & 255),
          (this[f + 1] = l >>> 8),
          (this[f + 2] = l >>> 16),
          (this[f + 3] = l >>> 24),
          f + 4
        );
      }),
      (c.prototype.writeInt32BE = function (l, f, I) {
        return (
          (l = +l),
          (f = f >>> 0),
          I || R(this, l, f, 4, 2147483647, -2147483648),
          l < 0 && (l = 4294967295 + l + 1),
          (this[f] = l >>> 24),
          (this[f + 1] = l >>> 16),
          (this[f + 2] = l >>> 8),
          (this[f + 3] = l & 255),
          f + 4
        );
      }),
      (c.prototype.writeBigInt64LE = Ge(function (l, f = 0) {
        return M(
          this,
          l,
          f,
          -BigInt("0x8000000000000000"),
          BigInt("0x7fffffffffffffff"),
        );
      })),
      (c.prototype.writeBigInt64BE = Ge(function (l, f = 0) {
        return X(
          this,
          l,
          f,
          -BigInt("0x8000000000000000"),
          BigInt("0x7fffffffffffffff"),
        );
      })));
    function Z(E, l, f, I, N, j) {
      if (f + I > E.length) throw new RangeError("Index out of range");
      if (f < 0) throw new RangeError("Index out of range");
    }
    function ce(E, l, f, I, N) {
      return (
        (l = +l),
        (f = f >>> 0),
        N || Z(E, l, f, 4),
        t.write(E, l, f, I, 23, 4),
        f + 4
      );
    }
    ((c.prototype.writeFloatLE = function (l, f, I) {
      return ce(this, l, f, !0, I);
    }),
      (c.prototype.writeFloatBE = function (l, f, I) {
        return ce(this, l, f, !1, I);
      }));
    function se(E, l, f, I, N) {
      return (
        (l = +l),
        (f = f >>> 0),
        N || Z(E, l, f, 8),
        t.write(E, l, f, I, 52, 8),
        f + 8
      );
    }
    ((c.prototype.writeDoubleLE = function (l, f, I) {
      return se(this, l, f, !0, I);
    }),
      (c.prototype.writeDoubleBE = function (l, f, I) {
        return se(this, l, f, !1, I);
      }),
      (c.prototype.copy = function (l, f, I, N) {
        if (!c.isBuffer(l)) throw new TypeError("argument should be a Buffer");
        if (
          (I || (I = 0),
          !N && N !== 0 && (N = this.length),
          f >= l.length && (f = l.length),
          f || (f = 0),
          N > 0 && N < I && (N = I),
          N === I || l.length === 0 || this.length === 0)
        )
          return 0;
        if (f < 0) throw new RangeError("targetStart out of bounds");
        if (I < 0 || I >= this.length)
          throw new RangeError("Index out of range");
        if (N < 0) throw new RangeError("sourceEnd out of bounds");
        (N > this.length && (N = this.length),
          l.length - f < N - I && (N = l.length - f + I));
        const j = N - I;
        return (
          this === l && typeof o.prototype.copyWithin == "function"
            ? this.copyWithin(f, I, N)
            : o.prototype.set.call(l, this.subarray(I, N), f),
          j
        );
      }),
      (c.prototype.fill = function (l, f, I, N) {
        if (typeof l == "string") {
          if (
            (typeof f == "string"
              ? ((N = f), (f = 0), (I = this.length))
              : typeof I == "string" && ((N = I), (I = this.length)),
            N !== void 0 && typeof N != "string")
          )
            throw new TypeError("encoding must be a string");
          if (typeof N == "string" && !c.isEncoding(N))
            throw new TypeError("Unknown encoding: " + N);
          if (l.length === 1) {
            const q = l.charCodeAt(0);
            ((N === "utf8" && q < 128) || N === "latin1") && (l = q);
          }
        } else
          typeof l == "number"
            ? (l = l & 255)
            : typeof l == "boolean" && (l = Number(l));
        if (f < 0 || this.length < f || this.length < I)
          throw new RangeError("Out of range index");
        if (I <= f) return this;
        ((f = f >>> 0),
          (I = I === void 0 ? this.length : I >>> 0),
          l || (l = 0));
        let j;
        if (typeof l == "number") for (j = f; j < I; ++j) this[j] = l;
        else {
          const q = c.isBuffer(l) ? l : c.from(l, N),
            ae = q.length;
          if (ae === 0)
            throw new TypeError(
              'The value "' + l + '" is invalid for argument "value"',
            );
          for (j = 0; j < I - f; ++j) this[j + f] = q[j % ae];
        }
        return this;
      }));
    const x = {};
    function T(E, l, f) {
      x[E] = class extends f {
        constructor() {
          (super(),
            Object.defineProperty(this, "message", {
              value: l.apply(this, arguments),
              writable: !0,
              configurable: !0,
            }),
            (this.name = `${this.name} [${E}]`),
            this.stack,
            delete this.name);
        }
        get code() {
          return E;
        }
        set code(N) {
          Object.defineProperty(this, "code", {
            configurable: !0,
            enumerable: !0,
            value: N,
            writable: !0,
          });
        }
        toString() {
          return `${this.name} [${E}]: ${this.message}`;
        }
      };
    }
    (T(
      "ERR_BUFFER_OUT_OF_BOUNDS",
      function (E) {
        return E
          ? `${E} is outside of buffer bounds`
          : "Attempt to access memory outside buffer bounds";
      },
      RangeError,
    ),
      T(
        "ERR_INVALID_ARG_TYPE",
        function (E, l) {
          return `The "${E}" argument must be of type number. Received type ${typeof l}`;
        },
        TypeError,
      ),
      T(
        "ERR_OUT_OF_RANGE",
        function (E, l, f) {
          let I = `The value of "${E}" is out of range.`,
            N = f;
          return (
            Number.isInteger(f) && Math.abs(f) > 2 ** 32
              ? (N = B(String(f)))
              : typeof f == "bigint" &&
                ((N = String(f)),
                (f > BigInt(2) ** BigInt(32) ||
                  f < -(BigInt(2) ** BigInt(32))) &&
                  (N = B(N)),
                (N += "n")),
            (I += ` It must be ${l}. Received ${N}`),
            I
          );
        },
        RangeError,
      ));
    function B(E) {
      let l = "",
        f = E.length;
      const I = E[0] === "-" ? 1 : 0;
      for (; f >= I + 4; f -= 3) l = `_${E.slice(f - 3, f)}${l}`;
      return `${E.slice(0, f)}${l}`;
    }
    function H(E, l, f) {
      (re(l, "offset"),
        (E[l] === void 0 || E[l + f] === void 0) && me(l, E.length - (f + 1)));
    }
    function Q(E, l, f, I, N, j) {
      if (E > f || E < l) {
        const q = typeof l == "bigint" ? "n" : "";
        let ae;
        throw (
          l === 0 || l === BigInt(0)
            ? (ae = `>= 0${q} and < 2${q} ** ${(j + 1) * 8}${q}`)
            : (ae = `>= -(2${q} ** ${(j + 1) * 8 - 1}${q}) and < 2 ** ${(j + 1) * 8 - 1}${q}`),
          new x.ERR_OUT_OF_RANGE("value", ae, E)
        );
      }
      H(I, N, j);
    }
    function re(E, l) {
      if (typeof E != "number")
        throw new x.ERR_INVALID_ARG_TYPE(l, "number", E);
    }
    function me(E, l, f) {
      throw Math.floor(E) !== E
        ? (re(E, f), new x.ERR_OUT_OF_RANGE("offset", "an integer", E))
        : l < 0
          ? new x.ERR_BUFFER_OUT_OF_BOUNDS()
          : new x.ERR_OUT_OF_RANGE("offset", `>= 0 and <= ${l}`, E);
    }
    const Me = /[^+/0-9A-Za-z-_]/g;
    function Ne(E) {
      if (((E = E.split("=")[0]), (E = E.trim().replace(Me, "")), E.length < 2))
        return "";
      for (; E.length % 4 !== 0; ) E = E + "=";
      return E;
    }
    function Ee(E, l) {
      l = l || 1 / 0;
      let f;
      const I = E.length;
      let N = null;
      const j = [];
      for (let q = 0; q < I; ++q) {
        if (((f = E.charCodeAt(q)), f > 55295 && f < 57344)) {
          if (!N) {
            if (f > 56319) {
              (l -= 3) > -1 && j.push(239, 191, 189);
              continue;
            } else if (q + 1 === I) {
              (l -= 3) > -1 && j.push(239, 191, 189);
              continue;
            }
            N = f;
            continue;
          }
          if (f < 56320) {
            ((l -= 3) > -1 && j.push(239, 191, 189), (N = f));
            continue;
          }
          f = (((N - 55296) << 10) | (f - 56320)) + 65536;
        } else N && (l -= 3) > -1 && j.push(239, 191, 189);
        if (((N = null), f < 128)) {
          if ((l -= 1) < 0) break;
          j.push(f);
        } else if (f < 2048) {
          if ((l -= 2) < 0) break;
          j.push((f >> 6) | 192, (f & 63) | 128);
        } else if (f < 65536) {
          if ((l -= 3) < 0) break;
          j.push((f >> 12) | 224, ((f >> 6) & 63) | 128, (f & 63) | 128);
        } else if (f < 1114112) {
          if ((l -= 4) < 0) break;
          j.push(
            (f >> 18) | 240,
            ((f >> 12) & 63) | 128,
            ((f >> 6) & 63) | 128,
            (f & 63) | 128,
          );
        } else throw new Error("Invalid code point");
      }
      return j;
    }
    function we(E) {
      const l = [];
      for (let f = 0; f < E.length; ++f) l.push(E.charCodeAt(f) & 255);
      return l;
    }
    function vr(E, l) {
      let f, I, N;
      const j = [];
      for (let q = 0; q < E.length && !((l -= 2) < 0); ++q)
        ((f = E.charCodeAt(q)),
          (I = f >> 8),
          (N = f % 256),
          j.push(N),
          j.push(I));
      return j;
    }
    function Te(E) {
      return r.toByteArray(Ne(E));
    }
    function _r(E, l, f, I) {
      let N;
      for (N = 0; N < I && !(N + f >= l.length || N >= E.length); ++N)
        l[N + f] = E[N];
      return N;
    }
    function je(E, l) {
      return (
        E instanceof l ||
        (E != null &&
          E.constructor != null &&
          E.constructor.name != null &&
          E.constructor.name === l.name)
      );
    }
    function lr(E) {
      return E !== E;
    }
    const nt = (function () {
      const E = "0123456789abcdef",
        l = new Array(256);
      for (let f = 0; f < 16; ++f) {
        const I = f * 16;
        for (let N = 0; N < 16; ++N) l[I + N] = E[f] + E[N];
      }
      return l;
    })();
    function Ge(E) {
      return typeof BigInt > "u" ? Sn : E;
    }
    function Sn() {
      throw new Error("BigInt not supported");
    }
  })(yi);
  const Be = yi.Buffer;
  function ec(e) {
    return e &&
      e.__esModule &&
      Object.prototype.hasOwnProperty.call(e, "default")
      ? e.default
      : e;
  }
  var vi = { exports: {} },
    ve = (vi.exports = {}),
    Je,
    Xe;
  function In() {
    throw new Error("setTimeout has not been defined");
  }
  function Rn() {
    throw new Error("clearTimeout has not been defined");
  }
  (function () {
    try {
      typeof setTimeout == "function" ? (Je = setTimeout) : (Je = In);
    } catch {
      Je = In;
    }
    try {
      typeof clearTimeout == "function" ? (Xe = clearTimeout) : (Xe = Rn);
    } catch {
      Xe = Rn;
    }
  })();
  function _i(e) {
    if (Je === setTimeout) return setTimeout(e, 0);
    if ((Je === In || !Je) && setTimeout)
      return ((Je = setTimeout), setTimeout(e, 0));
    try {
      return Je(e, 0);
    } catch {
      try {
        return Je.call(null, e, 0);
      } catch {
        return Je.call(this, e, 0);
      }
    }
  }
  function rc(e) {
    if (Xe === clearTimeout) return clearTimeout(e);
    if ((Xe === Rn || !Xe) && clearTimeout)
      return ((Xe = clearTimeout), clearTimeout(e));
    try {
      return Xe(e);
    } catch {
      try {
        return Xe.call(null, e);
      } catch {
        return Xe.call(this, e);
      }
    }
  }
  var rr = [],
    Rr = !1,
    $r,
    ot = -1;
  function tc() {
    !Rr ||
      !$r ||
      ((Rr = !1),
      $r.length ? (rr = $r.concat(rr)) : (ot = -1),
      rr.length && $i());
  }
  function $i() {
    if (!Rr) {
      var e = _i(tc);
      Rr = !0;
      for (var r = rr.length; r; ) {
        for ($r = rr, rr = []; ++ot < r; ) $r && $r[ot].run();
        ((ot = -1), (r = rr.length));
      }
      (($r = null), (Rr = !1), rc(e));
    }
  }
  ve.nextTick = function (e) {
    var r = new Array(arguments.length - 1);
    if (arguments.length > 1)
      for (var t = 1; t < arguments.length; t++) r[t - 1] = arguments[t];
    (rr.push(new wi(e, r)), rr.length === 1 && !Rr && _i($i));
  };
  function wi(e, r) {
    ((this.fun = e), (this.array = r));
  }
  ((wi.prototype.run = function () {
    this.fun.apply(null, this.array);
  }),
    (ve.title = "browser"),
    (ve.browser = !0),
    (ve.env = {}),
    (ve.argv = []),
    (ve.version = ""),
    (ve.versions = {}));
  function tr() {}
  ((ve.on = tr),
    (ve.addListener = tr),
    (ve.once = tr),
    (ve.off = tr),
    (ve.removeListener = tr),
    (ve.removeAllListeners = tr),
    (ve.emit = tr),
    (ve.prependListener = tr),
    (ve.prependOnceListener = tr),
    (ve.listeners = function (e) {
      return [];
    }),
    (ve.binding = function (e) {
      throw new Error("process.binding is not supported");
    }),
    (ve.cwd = function () {
      return "/";
    }),
    (ve.chdir = function (e) {
      throw new Error("process.chdir is not supported");
    }),
    (ve.umask = function () {
      return 0;
    }));
  var nc = vi.exports;
  const ur = ec(nc),
    ic = "\\";
  function Or(e) {
    return e.startsWith("\\\\?\\") ? e : e.split(ic).join("/");
  }
  const oc = /^win/.test(globalThis.process ? globalThis.process.platform : ""),
    st = () => oc,
    sc = /\//g,
    ac = /^(\w{2,}):\/\//i,
    cc = /~1/g,
    lc = /~0/g,
    uc = /^[a-zA-Z]:\\/,
    fc = [
      [/\?/g, "%3F"],
      [/#/g, "%23"],
    ],
    On = [/%23/g, "#", /%24/g, "$", /%26/g, "&", /%2C/g, ",", /%40/g, "@"],
    at = (e) => new URL(e);
  function Qe(e, r) {
    const t = new URL(Or(e), "https://aaa.nonexistanturl.com"),
      n = new URL(Or(r), t),
      i = r.match(/(\s*)$/)?.[1] || "";
    if (n.hostname === "aaa.nonexistanturl.com") {
      const { pathname: s, search: a, hash: u } = n;
      return s + a + decodeURIComponent(u) + i;
    }
    const o = n.toString() + i;
    if (o.includes("#")) {
      const [s, a] = o.split("#", 2);
      return s + "#" + decodeURIComponent(a || "");
    }
    return o;
  }
  function ct() {
    if (typeof window < "u" && window.location && window.location.href) {
      const e = window.location.href;
      if (!e || !e.startsWith("http"))
        try {
          return (new URL(e), e);
        } catch {
          return "/";
        }
      return e;
    }
    if (typeof ur < "u" && ur.cwd) {
      const e = ur.cwd(),
        r = e.slice(-1);
      return r === "/" || r === "\\" ? e : e + "/";
    }
    return "/";
  }
  function bi(e) {
    const r = ac.exec(e || "");
    if (r) return r[1].toLowerCase();
  }
  function dc(e) {
    const r = e.lastIndexOf(".");
    return r >= 0 ? pc(e.substring(r).toLowerCase()) : "";
  }
  function pc(e) {
    const r = e.indexOf("?");
    return (r >= 0 && (e = e.substring(0, r)), e);
  }
  function Kr(e) {
    if (!e) return "#";
    const r = e.indexOf("#");
    return r >= 0 ? e.substring(r) : "#";
  }
  function Le(e) {
    if (!e) return "";
    const r = e.indexOf("#");
    return (r >= 0 && (e = e.substring(0, r)), e);
  }
  function hc(e) {
    const r = bi(e);
    return r === "http" || r === "https"
      ? !0
      : r === void 0
        ? typeof window < "u"
        : !1;
  }
  function mc(e) {
    if (!e || typeof e != "string") return !0;
    const r = e.trim().toLowerCase();
    if (
      !r ||
      r.startsWith("javascript:") ||
      r.startsWith("vbscript:") ||
      r.startsWith("data:") ||
      r.startsWith("file:")
    )
      return !0;
    if (typeof window < "u" && window.location && window.location.href)
      return !1;
    const t = [
      "localhost",
      "127.0.0.1",
      "::1",
      "10.",
      "172.16.",
      "172.17.",
      "172.18.",
      "172.19.",
      "172.20.",
      "172.21.",
      "172.22.",
      "172.23.",
      "172.24.",
      "172.25.",
      "172.26.",
      "172.27.",
      "172.28.",
      "172.29.",
      "172.30.",
      "172.31.",
      "192.168.",
      "169.254.",
      ".local",
      ".internal",
      ".intranet",
      ".corp",
      ".home",
      ".lan",
    ];
    try {
      const n = new URL(r.startsWith("//") ? "http:" + r : r),
        i = n.hostname.toLowerCase();
      for (const s of t)
        if (i === s || i.startsWith(s) || i.endsWith(s)) return !0;
      if (yc(i)) return !0;
      const o = n.port;
      if (o && gc(parseInt(o))) return !0;
    } catch {
      if (r.startsWith("/") && !r.startsWith("//")) return !1;
      for (const n of t) if (r.includes(n)) return !0;
    }
    return !1;
  }
  function yc(e) {
    const r = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
      t = e.match(r);
    if (!t) return !1;
    const [, n, i, o, s] = t.map(Number);
    return n > 255 || i > 255 || o > 255 || s > 255
      ? !1
      : n === 10 ||
          n === 127 ||
          (n === 172 && i >= 16 && i <= 31) ||
          (n === 192 && i === 168) ||
          (n === 169 && i === 254);
  }
  function gc(e) {
    return [
      22, 23, 25, 53, 135, 139, 445, 993, 995, 1433, 1521, 3306, 3389, 5432,
      5900, 6379, 8080, 8443, 9200, 27017,
    ].includes(e);
  }
  function Ei(e) {
    if (typeof window < "u" || (typeof ur < "u" && ur.browser)) return !1;
    const r = bi(e);
    return r === void 0 || r === "file";
  }
  function vc(e) {
    if (st()) {
      const r = ct(),
        t = e.toUpperCase(),
        i = Or(r).toUpperCase(),
        o = t.includes(i),
        s = t.includes(i),
        a =
          uc.test(e) ||
          e.startsWith("http://") ||
          e.startsWith("https://") ||
          e.startsWith("file://");
      (!(o || s || a) &&
        !r.startsWith("http") &&
        (e = ((d, c) =>
          d.endsWith("/") || d.endsWith("\\") ? d + c : d + "/" + c)(r, e)),
        (e = Or(e)));
    }
    e = encodeURI(e);
    for (const r of fc) e = e.replace(r[0], r[1]);
    return e;
  }
  function Nn(e, r) {
    e = decodeURI(e);
    for (let n = 0; n < On.length; n += 2) e = e.replace(On[n], On[n + 1]);
    let t = e.toLowerCase().startsWith("file://");
    return (
      t &&
        ((e = e.replace(/^file:\/\//, "").replace(/^\//, "")),
        st() && e[1] === "/" && (e = `${e[0]}:${e.substring(1)}`),
        r ? (e = "file:///" + e) : ((t = !1), (e = st() ? e : "/" + e))),
      st() &&
        !t &&
        ((e = e.replace(sc, "\\")),
        e.match(/^[a-z]:\\/i) && (e = e[0].toUpperCase() + e.substring(1))),
      e
    );
  }
  function Si(e) {
    return e.length <= 1 || e[0] !== "#" || e[1] !== "/"
      ? []
      : e
          .slice(2)
          .split("/")
          .map((r) => r.replace(cc, "/").replace(lc, "~"));
  }
  const _c = ["function", "symbol", "undefined"],
    $c = ["constructor", "prototype", "__proto__"],
    wc = Object.getPrototypeOf({});
  function Pi() {
    const e = {},
      r = this;
    for (const t of bc(r))
      if (typeof t == "string") {
        const n = r[t],
          i = typeof n;
        _c.includes(i) || (e[t] = n);
      }
    return e;
  }
  function bc(e, r = []) {
    let t = [];
    for (; e && e !== wc; )
      ((t = t.concat(
        Object.getOwnPropertyNames(e),
        Object.getOwnPropertySymbols(e),
      )),
        (e = Object.getPrototypeOf(e)));
    const n = new Set(t);
    for (const i of r.concat($c)) n.delete(i);
    return n;
  }
  class nr extends Error {
    name;
    message;
    source;
    path;
    code;
    constructor(r, t) {
      (super(),
        (this.code = "EUNKNOWN"),
        (this.name = "JSONParserError"),
        (this.message = r),
        (this.source = t),
        (this.path = null));
    }
    toJSON = Pi.bind(this);
    get footprint() {
      return `${this.path}+${this.source}+${this.code}+${this.message}`;
    }
  }
  class Hr extends Error {
    files;
    constructor(r) {
      (super(),
        (this.files = r),
        (this.name = "JSONParserErrorGroup"),
        (this.message = `${this.errors.length} error${this.errors.length > 1 ? "s" : ""} occurred while reading '${Nn(r.$refs._root$Ref.path)}'`));
    }
    toJSON = Pi.bind(this);
    static getParserErrors(r) {
      const t = [];
      for (const n of Object.values(r.$refs._$refs))
        n.errors && t.push(...n.errors);
      return t;
    }
    get errors() {
      return Hr.getParserErrors(this.files);
    }
  }
  class Nr extends nr {
    code = "EPARSER";
    name = "ParserError";
    constructor(r, t) {
      super(`Error parsing ${t}: ${r}`, t);
    }
  }
  class Ec extends nr {
    code = "EUNMATCHEDPARSER";
    name = "UnmatchedParserError";
    constructor(r) {
      super(`Could not find parser for "${r}"`, r);
    }
  }
  class xr extends nr {
    code = "ERESOLVER";
    name = "ResolverError";
    ioErrorCode;
    constructor(r, t) {
      (super(r.message || `Error reading file "${t}"`, t),
        "code" in r && (this.ioErrorCode = String(r.code)));
    }
  }
  class Sc extends nr {
    code = "EUNMATCHEDRESOLVER";
    name = "UnmatchedResolverError";
    constructor(r) {
      super(`Could not find resolver for "${r}"`, r);
    }
  }
  class Pc extends nr {
    code = "EMISSINGPOINTER";
    name = "MissingPointerError";
    targetToken;
    targetRef;
    targetFound;
    parentPath;
    constructor(r, t, n, i, o) {
      (super(
        `Missing $ref pointer "${Kr(t)}". Token "${r}" does not exist.`,
        Le(t),
      ),
        (this.targetToken = r),
        (this.targetRef = n),
        (this.targetFound = i),
        (this.parentPath = o));
    }
  }
  class Ac extends nr {
    code = "ETIMEOUT";
    name = "TimeoutError";
    constructor(r) {
      super(`Dereferencing timeout reached: ${r}ms`);
    }
  }
  class Ai extends nr {
    code = "EUNMATCHEDRESOLVER";
    name = "InvalidPointerError";
    constructor(r, t) {
      super(
        `Invalid $ref pointer "${r}". Pointers must begin with "#/"`,
        Le(t),
      );
    }
  }
  function Wr(e) {
    return e instanceof nr || e instanceof Hr;
  }
  function Ii(e) {
    return (e.path === null && (e.path = []), e);
  }
  const xn = Symbol("null"),
    Ic = /\//g,
    Rc = /~/g,
    Oc = /~1/g,
    Nc = /~0/g;
  class Re {
    $ref;
    path;
    originalPath;
    value;
    circular;
    indirections;
    constructor(r, t, n) {
      ((this.$ref = r),
        (this.path = t),
        (this.originalPath = n || t),
        (this.value = void 0),
        (this.circular = !1),
        (this.indirections = 0));
    }
    resolve(r, t, n) {
      const i = Re.parse(this.path, this.originalPath),
        o = [];
      this.value = Oi(r);
      for (let s = 0; s < i.length; s++) {
        lt(this, t, n) && (this.path = Re.join(this.path, i.slice(s)));
        const a = i[s];
        if (
          this.value[a] === void 0 ||
          (this.value[a] === null && s === i.length - 1)
        ) {
          let u = !1;
          for (let p = i.length - 1; p > s; p--) {
            const v = i.slice(s, p + 1).join("/");
            if (this.value[v] !== void 0) {
              ((this.value = this.value[v]), (s = p), (u = !0));
              break;
            }
          }
          if (u) continue;
          if (a in this.value && this.value[a] === null) {
            this.value = xn;
            continue;
          }
          this.value = null;
          const d = this.$ref.path || "",
            c = this.path.replace(d, ""),
            g = Re.join("", o),
            h = n?.replace(d, "");
          throw new Pc(a, decodeURI(this.originalPath), c, g, h);
        } else this.value = this.value[a];
        o.push(a);
      }
      return (
        (!this.value ||
          (this.value.$ref && Qe(this.path, this.value.$ref) !== n)) &&
          lt(this, t, n),
        this
      );
    }
    set(r, t, n) {
      const i = Re.parse(this.path);
      let o;
      if (i.length === 0) return ((this.value = t), t);
      this.value = Oi(r);
      for (let s = 0; s < i.length - 1; s++)
        (lt(this, n),
          (o = i[s]),
          this.value && this.value[o] !== void 0
            ? (this.value = this.value[o])
            : (this.value = Ri(this, o, {})));
      return (lt(this, n), (o = i[i.length - 1]), Ri(this, o, t), r);
    }
    static parse(r, t) {
      const n = Kr(r).substring(1);
      if (!n) return [];
      const i = n.split("/");
      for (let o = 0; o < i.length; o++)
        i[o] = i[o].replace(Oc, "/").replace(Nc, "~");
      if (i[0] !== "") throw new Ai(n, t === void 0 ? r : t);
      return i.slice(1);
    }
    static join(r, t) {
      (r.indexOf("#") === -1 && (r += "#"), (t = Array.isArray(t) ? t : [t]));
      for (let n = 0; n < t.length; n++) {
        const i = t[n];
        r += "/" + i.replace(Rc, "~0").replace(Ic, "~1");
      }
      return r;
    }
  }
  function lt(e, r, t) {
    if (Se.isAllowed$Ref(e.value, r)) {
      const n = Qe(e.path, e.value.$ref);
      if (n === e.path && !xc(t)) e.circular = !0;
      else {
        const i = e.$ref.$refs._resolve(n, e.path, r);
        return i === null
          ? !1
          : ((e.indirections += i.indirections + 1),
            Se.isExtended$Ref(e.value)
              ? ((e.value = Se.dereference(e.value, i.value, r)), !1)
              : ((e.$ref = i.$ref),
                (e.path = i.path),
                (e.value = i.value),
                !0));
      }
    }
  }
  function Ri(e, r, t) {
    if (e.value && typeof e.value == "object")
      r === "-" && Array.isArray(e.value) ? e.value.push(t) : (e.value[r] = t);
    else
      throw new nr(`Error assigning $ref pointer "${e.path}". 
Cannot set "${r}" of a non-object.`);
    return t;
  }
  function Oi(e) {
    if (Wr(e)) throw e;
    return e;
  }
  function xc(e) {
    return typeof e == "string" && Re.parse(e).length == 0;
  }
  class Se {
    path;
    value;
    $refs;
    pathType;
    errors = [];
    constructor(r) {
      this.$refs = r;
    }
    addError(r) {
      this.errors === void 0 && (this.errors = []);
      const t = this.errors.map(({ footprint: n }) => n);
      "errors" in r && Array.isArray(r.errors)
        ? this.errors.push(
            ...r.errors.map(Ii).filter(({ footprint: n }) => !t.includes(n)),
          )
        : (!("footprint" in r) || !t.includes(r.footprint)) &&
          this.errors.push(Ii(r));
    }
    exists(r, t) {
      try {
        return (this.resolve(r, t), !0);
      } catch {
        return !1;
      }
    }
    get(r, t) {
      return this.resolve(r, t)?.value;
    }
    resolve(r, t, n, i) {
      const o = new Re(this, r, n);
      try {
        const s = o.resolve(this.value, t, i);
        return (s.value === xn && (s.value = null), s);
      } catch (s) {
        if (!t || !t.continueOnError || !Wr(s)) throw s;
        return (
          s.path === null && (s.path = Si(Kr(i))),
          s instanceof Ai && (s.source = decodeURI(Le(i))),
          this.addError(s),
          null
        );
      }
    }
    set(r, t) {
      const n = new Re(this, r);
      ((this.value = n.set(this.value, t)),
        this.value === xn && (this.value = null));
    }
    static is$Ref(r) {
      return (
        !!r &&
        typeof r == "object" &&
        r !== null &&
        "$ref" in r &&
        typeof r.$ref == "string" &&
        r.$ref.length > 0
      );
    }
    static isExternal$Ref(r) {
      return Se.is$Ref(r) && r.$ref[0] !== "#";
    }
    static isAllowed$Ref(r, t) {
      if (this.is$Ref(r)) {
        if (r.$ref.substring(0, 2) === "#/" || r.$ref === "#") return !0;
        if (r.$ref[0] !== "#" && (!t || t.resolve?.external)) return !0;
      }
    }
    static isExtended$Ref(r) {
      return Se.is$Ref(r) && Object.keys(r).length > 1;
    }
    static dereference(r, t, n) {
      if (t && typeof t == "object" && Se.isExtended$Ref(r)) {
        const i = {};
        for (const s of Object.keys(r)) s !== "$ref" && (i[s] = r[s]);
        const o = n?.dereference?.mergeKeys ?? !0;
        for (const s of Object.keys(t)) {
          const a = s;
          a in i
            ? o &&
              typeof i[a] == "object" &&
              i[a] !== null &&
              typeof t[a] == "object" &&
              t[a] !== null &&
              (i[a] = Ni(t[a], i[a]))
            : (i[a] = t[a]);
        }
        return i;
      } else return t;
    }
  }
  function Ni(e, r) {
    if (
      typeof e != "object" ||
      e === null ||
      typeof r != "object" ||
      r === null
    )
      return r;
    const t = Array.isArray(e) ? [...e] : { ...e };
    for (const n of Object.keys(r))
      Array.isArray(r[n])
        ? (t[n] = [...r[n]])
        : typeof r[n] == "object" && r[n] !== null
          ? (t[n] = Ni(e[n], r[n]))
          : (t[n] = r[n]);
    return t;
  }
  class xi {
    circular;
    paths(...r) {
      return ki(this._$refs, r.flat()).map((n) => Or(n.decoded));
    }
    values(...r) {
      const t = this._$refs;
      return ki(t, r.flat()).reduce(
        (i, o) => ((i[Or(o.decoded)] = t[o.encoded].value), i),
        {},
      );
    }
    exists(r, t) {
      try {
        return (this._resolve(r, "", t), !0);
      } catch {
        return !1;
      }
    }
    get(r, t) {
      return this._resolve(r, "", t).value;
    }
    set(r, t) {
      const n = Qe(this._root$Ref.path, r),
        i = Le(n),
        o = this._$refs[i];
      if (!o)
        throw new Error(`Error resolving $ref pointer "${r}". 
"${i}" not found.`);
      o.set(n, t);
    }
    _get$Ref(r) {
      r = Qe(this._root$Ref.path, r);
      const t = Le(r);
      return this._$refs[t];
    }
    _add(r) {
      const t = Le(r),
        n = new Se(this);
      return (
        (n.path = t),
        (this._$refs[t] = n),
        (this._root$Ref = this._root$Ref || n),
        n
      );
    }
    _resolve(r, t, n) {
      const i = Qe(this._root$Ref.path, r),
        o = Le(i),
        s = this._$refs[o];
      if (!s)
        throw new Error(`Error resolving $ref pointer "${r}". 
"${o}" not found.`);
      return s.resolve(i, n, r, t);
    }
    _$refs = {};
    _root$Ref;
    constructor() {
      ((this.circular = !1), (this._$refs = {}), (this._root$Ref = null));
    }
    toJSON = this.values;
  }
  function ki(e, r) {
    let t = Object.keys(e);
    return (
      (r = Array.isArray(r[0]) ? r[0] : Array.prototype.slice.call(r)),
      r.length > 0 && r[0] && (t = t.filter((n) => r.includes(e[n].pathType))),
      t.map((n) => ({
        encoded: n,
        decoded: e[n].pathType === "file" ? Nn(n, !0) : n,
      }))
    );
  }
  function Ti(e) {
    return Object.keys(e || {})
      .filter((r) => typeof e[r] == "object")
      .map((r) => ((e[r].name = r), e[r]));
  }
  function Ci(e, r, t, n, i) {
    return e.filter((o) => !!Di(o, r, t, n, i));
  }
  function ji(e) {
    for (const r of e) r.order = r.order || Number.MAX_SAFE_INTEGER;
    return e.sort((r, t) => r.order - t.order);
  }
  async function Fi(e, r, t, n) {
    let i,
      o,
      s = 0;
    return new Promise((a, u) => {
      d();
      function d() {
        if (((i = e[s++]), !i)) return u(o);
        try {
          const p = Di(i, r, t, c, n);
          if (p && typeof p.then == "function") p.then(g, h);
          else if (p !== void 0) g(p);
          else if (s === e.length)
            throw new Error(
              "No promise has been returned or callback has been called.",
            );
        } catch (p) {
          h(p);
        }
      }
      function c(p, v) {
        p ? h(p) : g(v);
      }
      function g(p) {
        a({ plugin: i, result: p });
      }
      function h(p) {
        ((o = { plugin: i, error: p }), d());
      }
    });
  }
  function Di(e, r, t, n, i) {
    const o = e[r];
    if (typeof o == "function") return o.apply(e, [t, n, i]);
    if (!n) {
      if (o instanceof RegExp) return o.test(t.url);
      if (typeof o == "string") return o === t.extension;
      if (Array.isArray(o)) return o.indexOf(t.extension) !== -1;
    }
    return o;
  }
  async function Mi(e, r, t) {
    const n = e.indexOf("#");
    let i = "";
    n >= 0 && ((i = e.substring(n)), (e = e.substring(0, n)));
    const o = r._add(e),
      s = { url: e, hash: i, extension: dc(e) };
    try {
      const a = await kc(s, t, r);
      ((o.pathType = a.plugin.name), (s.data = a.result));
      const u = await Tc(s, t, r);
      return ((o.value = u.result), u.result);
    } catch (a) {
      throw (Wr(a) && (o.value = a), a);
    }
  }
  async function kc(e, r, t) {
    let n = Ti(r.resolve);
    ((n = Ci(n, "canRead", e, void 0, t)), ji(n));
    try {
      return await Fi(n, "read", e, t);
    } catch (i) {
      throw !i && r.continueOnError
        ? new Sc(e.url)
        : !i || !("error" in i)
          ? new SyntaxError(`Unable to resolve $ref pointer "${e.url}"`)
          : i.error instanceof xr
            ? i.error
            : new xr(i, e.url);
    }
  }
  async function Tc(e, r, t) {
    const n = Ti(r.parse),
      i = Ci(n, "canParse", e),
      o = i.length > 0 ? i : n;
    ji(o);
    try {
      const s = await Fi(o, "parse", e, t);
      if (!s.plugin.allowEmpty && Cc(s.result))
        throw new SyntaxError(`Error parsing "${e.url}" as ${s.plugin.name}. 
Parsed value is empty`);
      return s;
    } catch (s) {
      throw !s && r.continueOnError
        ? new Ec(e.url)
        : s && s.message && s.message.startsWith("Error parsing")
          ? s
          : !s || !("error" in s)
            ? new SyntaxError(`Unable to parse ${e.url}`)
            : s.error instanceof Nr
              ? s.error
              : new Nr(s.error.message, e.url);
    }
  }
  function Cc(e) {
    return (
      e === void 0 ||
      (typeof e == "object" && Object.keys(e).length === 0) ||
      (typeof e == "string" && e.trim().length === 0) ||
      (Be.isBuffer(e) && e.length === 0)
    );
  }
  const jc = {
    order: 100,
    allowEmpty: !0,
    canParse: ".json",
    allowBOM: !0,
    async parse(e) {
      let r = e.data;
      if ((Be.isBuffer(r) && (r = r.toString()), typeof r == "string")) {
        if (r.trim().length === 0) return;
        try {
          return JSON.parse(r);
        } catch (t) {
          if (this.allowBOM)
            try {
              const n = r.indexOf("{");
              return ((r = r.slice(n)), JSON.parse(r));
            } catch (n) {
              throw new Nr(n.message, e.url);
            }
          throw new Nr(t.message, e.url);
        }
      } else return r;
    },
  };
  function qi(e) {
    return typeof e > "u" || e === null;
  }
  function Fc(e) {
    return typeof e == "object" && e !== null;
  }
  function Dc(e) {
    return Array.isArray(e) ? e : qi(e) ? [] : [e];
  }
  function Mc(e, r) {
    var t, n, i, o;
    if (r)
      for (o = Object.keys(r), t = 0, n = o.length; t < n; t += 1)
        ((i = o[t]), (e[i] = r[i]));
    return e;
  }
  function qc(e, r) {
    var t = "",
      n;
    for (n = 0; n < r; n += 1) t += e;
    return t;
  }
  function Lc(e) {
    return e === 0 && Number.NEGATIVE_INFINITY === 1 / e;
  }
  var Bc = qi,
    Uc = Fc,
    Vc = Dc,
    zc = qc,
    Kc = Lc,
    Hc = Mc,
    $e = {
      isNothing: Bc,
      isObject: Uc,
      toArray: Vc,
      repeat: zc,
      isNegativeZero: Kc,
      extend: Hc,
    };
  function Li(e, r) {
    var t = "",
      n = e.reason || "(unknown reason)";
    return e.mark
      ? (e.mark.name && (t += 'in "' + e.mark.name + '" '),
        (t += "(" + (e.mark.line + 1) + ":" + (e.mark.column + 1) + ")"),
        !r &&
          e.mark.snippet &&
          (t +=
            `

` + e.mark.snippet),
        n + " " + t)
      : n;
  }
  function Gr(e, r) {
    (Error.call(this),
      (this.name = "YAMLException"),
      (this.reason = e),
      (this.mark = r),
      (this.message = Li(this, !1)),
      Error.captureStackTrace
        ? Error.captureStackTrace(this, this.constructor)
        : (this.stack = new Error().stack || ""));
  }
  ((Gr.prototype = Object.create(Error.prototype)),
    (Gr.prototype.constructor = Gr),
    (Gr.prototype.toString = function (r) {
      return this.name + ": " + Li(this, r);
    }));
  var xe = Gr;
  function kn(e, r, t, n, i) {
    var o = "",
      s = "",
      a = Math.floor(i / 2) - 1;
    return (
      n - r > a && ((o = " ... "), (r = n - a + o.length)),
      t - n > a && ((s = " ..."), (t = n + a - s.length)),
      { str: o + e.slice(r, t).replace(/\t/g, "→") + s, pos: n - r + o.length }
    );
  }
  function Tn(e, r) {
    return $e.repeat(" ", r - e.length) + e;
  }
  function Wc(e, r) {
    if (((r = Object.create(r || null)), !e.buffer)) return null;
    (r.maxLength || (r.maxLength = 79),
      typeof r.indent != "number" && (r.indent = 1),
      typeof r.linesBefore != "number" && (r.linesBefore = 3),
      typeof r.linesAfter != "number" && (r.linesAfter = 2));
    for (
      var t = /\r?\n|\r|\0/g, n = [0], i = [], o, s = -1;
      (o = t.exec(e.buffer));
    )
      (i.push(o.index),
        n.push(o.index + o[0].length),
        e.position <= o.index && s < 0 && (s = n.length - 2));
    s < 0 && (s = n.length - 1);
    var a = "",
      u,
      d,
      c = Math.min(e.line + r.linesAfter, i.length).toString().length,
      g = r.maxLength - (r.indent + c + 3);
    for (u = 1; u <= r.linesBefore && !(s - u < 0); u++)
      ((d = kn(
        e.buffer,
        n[s - u],
        i[s - u],
        e.position - (n[s] - n[s - u]),
        g,
      )),
        (a =
          $e.repeat(" ", r.indent) +
          Tn((e.line - u + 1).toString(), c) +
          " | " +
          d.str +
          `
` +
          a));
    for (
      d = kn(e.buffer, n[s], i[s], e.position, g),
        a +=
          $e.repeat(" ", r.indent) +
          Tn((e.line + 1).toString(), c) +
          " | " +
          d.str +
          `
`,
        a +=
          $e.repeat("-", r.indent + c + 3 + d.pos) +
          `^
`,
        u = 1;
      u <= r.linesAfter && !(s + u >= i.length);
      u++
    )
      ((d = kn(
        e.buffer,
        n[s + u],
        i[s + u],
        e.position - (n[s] - n[s + u]),
        g,
      )),
        (a +=
          $e.repeat(" ", r.indent) +
          Tn((e.line + u + 1).toString(), c) +
          " | " +
          d.str +
          `
`));
    return a.replace(/\n$/, "");
  }
  var Gc = Wc,
    Yc = [
      "kind",
      "multi",
      "resolve",
      "construct",
      "instanceOf",
      "predicate",
      "represent",
      "representName",
      "defaultStyle",
      "styleAliases",
    ],
    Jc = ["scalar", "sequence", "mapping"];
  function Xc(e) {
    var r = {};
    return (
      e !== null &&
        Object.keys(e).forEach(function (t) {
          e[t].forEach(function (n) {
            r[String(n)] = t;
          });
        }),
      r
    );
  }
  function Qc(e, r) {
    if (
      ((r = r || {}),
      Object.keys(r).forEach(function (t) {
        if (Yc.indexOf(t) === -1)
          throw new xe(
            'Unknown option "' +
              t +
              '" is met in definition of "' +
              e +
              '" YAML type.',
          );
      }),
      (this.options = r),
      (this.tag = e),
      (this.kind = r.kind || null),
      (this.resolve =
        r.resolve ||
        function () {
          return !0;
        }),
      (this.construct =
        r.construct ||
        function (t) {
          return t;
        }),
      (this.instanceOf = r.instanceOf || null),
      (this.predicate = r.predicate || null),
      (this.represent = r.represent || null),
      (this.representName = r.representName || null),
      (this.defaultStyle = r.defaultStyle || null),
      (this.multi = r.multi || !1),
      (this.styleAliases = Xc(r.styleAliases || null)),
      Jc.indexOf(this.kind) === -1)
    )
      throw new xe(
        'Unknown kind "' +
          this.kind +
          '" is specified for "' +
          e +
          '" YAML type.',
      );
  }
  var Pe = Qc;
  function Bi(e, r) {
    var t = [];
    return (
      e[r].forEach(function (n) {
        var i = t.length;
        (t.forEach(function (o, s) {
          o.tag === n.tag &&
            o.kind === n.kind &&
            o.multi === n.multi &&
            (i = s);
        }),
          (t[i] = n));
      }),
      t
    );
  }
  function Zc() {
    var e = {
        scalar: {},
        sequence: {},
        mapping: {},
        fallback: {},
        multi: { scalar: [], sequence: [], mapping: [], fallback: [] },
      },
      r,
      t;
    function n(i) {
      i.multi
        ? (e.multi[i.kind].push(i), e.multi.fallback.push(i))
        : (e[i.kind][i.tag] = e.fallback[i.tag] = i);
    }
    for (r = 0, t = arguments.length; r < t; r += 1) arguments[r].forEach(n);
    return e;
  }
  function Cn(e) {
    return this.extend(e);
  }
  Cn.prototype.extend = function (r) {
    var t = [],
      n = [];
    if (r instanceof Pe) n.push(r);
    else if (Array.isArray(r)) n = n.concat(r);
    else if (r && (Array.isArray(r.implicit) || Array.isArray(r.explicit)))
      (r.implicit && (t = t.concat(r.implicit)),
        r.explicit && (n = n.concat(r.explicit)));
    else
      throw new xe(
        "Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })",
      );
    (t.forEach(function (o) {
      if (!(o instanceof Pe))
        throw new xe(
          "Specified list of YAML types (or a single Type object) contains a non-Type object.",
        );
      if (o.loadKind && o.loadKind !== "scalar")
        throw new xe(
          "There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.",
        );
      if (o.multi)
        throw new xe(
          "There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.",
        );
    }),
      n.forEach(function (o) {
        if (!(o instanceof Pe))
          throw new xe(
            "Specified list of YAML types (or a single Type object) contains a non-Type object.",
          );
      }));
    var i = Object.create(Cn.prototype);
    return (
      (i.implicit = (this.implicit || []).concat(t)),
      (i.explicit = (this.explicit || []).concat(n)),
      (i.compiledImplicit = Bi(i, "implicit")),
      (i.compiledExplicit = Bi(i, "explicit")),
      (i.compiledTypeMap = Zc(i.compiledImplicit, i.compiledExplicit)),
      i
    );
  };
  var Ui = Cn,
    Vi = new Pe("tag:yaml.org,2002:str", {
      kind: "scalar",
      construct: function (e) {
        return e !== null ? e : "";
      },
    }),
    zi = new Pe("tag:yaml.org,2002:seq", {
      kind: "sequence",
      construct: function (e) {
        return e !== null ? e : [];
      },
    }),
    Ki = new Pe("tag:yaml.org,2002:map", {
      kind: "mapping",
      construct: function (e) {
        return e !== null ? e : {};
      },
    }),
    Hi = new Ui({ explicit: [Vi, zi, Ki] });
  function el(e) {
    if (e === null) return !0;
    var r = e.length;
    return (
      (r === 1 && e === "~") ||
      (r === 4 && (e === "null" || e === "Null" || e === "NULL"))
    );
  }
  function rl() {
    return null;
  }
  function tl(e) {
    return e === null;
  }
  var Wi = new Pe("tag:yaml.org,2002:null", {
    kind: "scalar",
    resolve: el,
    construct: rl,
    predicate: tl,
    represent: {
      canonical: function () {
        return "~";
      },
      lowercase: function () {
        return "null";
      },
      uppercase: function () {
        return "NULL";
      },
      camelcase: function () {
        return "Null";
      },
      empty: function () {
        return "";
      },
    },
    defaultStyle: "lowercase",
  });
  function nl(e) {
    if (e === null) return !1;
    var r = e.length;
    return (
      (r === 4 && (e === "true" || e === "True" || e === "TRUE")) ||
      (r === 5 && (e === "false" || e === "False" || e === "FALSE"))
    );
  }
  function il(e) {
    return e === "true" || e === "True" || e === "TRUE";
  }
  function ol(e) {
    return Object.prototype.toString.call(e) === "[object Boolean]";
  }
  var Gi = new Pe("tag:yaml.org,2002:bool", {
    kind: "scalar",
    resolve: nl,
    construct: il,
    predicate: ol,
    represent: {
      lowercase: function (e) {
        return e ? "true" : "false";
      },
      uppercase: function (e) {
        return e ? "TRUE" : "FALSE";
      },
      camelcase: function (e) {
        return e ? "True" : "False";
      },
    },
    defaultStyle: "lowercase",
  });
  function sl(e) {
    return (
      (48 <= e && e <= 57) || (65 <= e && e <= 70) || (97 <= e && e <= 102)
    );
  }
  function al(e) {
    return 48 <= e && e <= 55;
  }
  function cl(e) {
    return 48 <= e && e <= 57;
  }
  function ll(e) {
    if (e === null) return !1;
    var r = e.length,
      t = 0,
      n = !1,
      i;
    if (!r) return !1;
    if (((i = e[t]), (i === "-" || i === "+") && (i = e[++t]), i === "0")) {
      if (t + 1 === r) return !0;
      if (((i = e[++t]), i === "b")) {
        for (t++; t < r; t++)
          if (((i = e[t]), i !== "_")) {
            if (i !== "0" && i !== "1") return !1;
            n = !0;
          }
        return n && i !== "_";
      }
      if (i === "x") {
        for (t++; t < r; t++)
          if (((i = e[t]), i !== "_")) {
            if (!sl(e.charCodeAt(t))) return !1;
            n = !0;
          }
        return n && i !== "_";
      }
      if (i === "o") {
        for (t++; t < r; t++)
          if (((i = e[t]), i !== "_")) {
            if (!al(e.charCodeAt(t))) return !1;
            n = !0;
          }
        return n && i !== "_";
      }
    }
    if (i === "_") return !1;
    for (; t < r; t++)
      if (((i = e[t]), i !== "_")) {
        if (!cl(e.charCodeAt(t))) return !1;
        n = !0;
      }
    return !(!n || i === "_");
  }
  function ul(e) {
    var r = e,
      t = 1,
      n;
    if (
      (r.indexOf("_") !== -1 && (r = r.replace(/_/g, "")),
      (n = r[0]),
      (n === "-" || n === "+") &&
        (n === "-" && (t = -1), (r = r.slice(1)), (n = r[0])),
      r === "0")
    )
      return 0;
    if (n === "0") {
      if (r[1] === "b") return t * parseInt(r.slice(2), 2);
      if (r[1] === "x") return t * parseInt(r.slice(2), 16);
      if (r[1] === "o") return t * parseInt(r.slice(2), 8);
    }
    return t * parseInt(r, 10);
  }
  function fl(e) {
    return (
      Object.prototype.toString.call(e) === "[object Number]" &&
      e % 1 === 0 &&
      !$e.isNegativeZero(e)
    );
  }
  var Yi = new Pe("tag:yaml.org,2002:int", {
      kind: "scalar",
      resolve: ll,
      construct: ul,
      predicate: fl,
      represent: {
        binary: function (e) {
          return e >= 0 ? "0b" + e.toString(2) : "-0b" + e.toString(2).slice(1);
        },
        octal: function (e) {
          return e >= 0 ? "0o" + e.toString(8) : "-0o" + e.toString(8).slice(1);
        },
        decimal: function (e) {
          return e.toString(10);
        },
        hexadecimal: function (e) {
          return e >= 0
            ? "0x" + e.toString(16).toUpperCase()
            : "-0x" + e.toString(16).toUpperCase().slice(1);
        },
      },
      defaultStyle: "decimal",
      styleAliases: {
        binary: [2, "bin"],
        octal: [8, "oct"],
        decimal: [10, "dec"],
        hexadecimal: [16, "hex"],
      },
    }),
    dl = new RegExp(
      "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$",
    );
  function pl(e) {
    return !(e === null || !dl.test(e) || e[e.length - 1] === "_");
  }
  function hl(e) {
    var r, t;
    return (
      (r = e.replace(/_/g, "").toLowerCase()),
      (t = r[0] === "-" ? -1 : 1),
      "+-".indexOf(r[0]) >= 0 && (r = r.slice(1)),
      r === ".inf"
        ? t === 1
          ? Number.POSITIVE_INFINITY
          : Number.NEGATIVE_INFINITY
        : r === ".nan"
          ? NaN
          : t * parseFloat(r, 10)
    );
  }
  var ml = /^[-+]?[0-9]+e/;
  function yl(e, r) {
    var t;
    if (isNaN(e))
      switch (r) {
        case "lowercase":
          return ".nan";
        case "uppercase":
          return ".NAN";
        case "camelcase":
          return ".NaN";
      }
    else if (Number.POSITIVE_INFINITY === e)
      switch (r) {
        case "lowercase":
          return ".inf";
        case "uppercase":
          return ".INF";
        case "camelcase":
          return ".Inf";
      }
    else if (Number.NEGATIVE_INFINITY === e)
      switch (r) {
        case "lowercase":
          return "-.inf";
        case "uppercase":
          return "-.INF";
        case "camelcase":
          return "-.Inf";
      }
    else if ($e.isNegativeZero(e)) return "-0.0";
    return ((t = e.toString(10)), ml.test(t) ? t.replace("e", ".e") : t);
  }
  function gl(e) {
    return (
      Object.prototype.toString.call(e) === "[object Number]" &&
      (e % 1 !== 0 || $e.isNegativeZero(e))
    );
  }
  var Ji = new Pe("tag:yaml.org,2002:float", {
      kind: "scalar",
      resolve: pl,
      construct: hl,
      predicate: gl,
      represent: yl,
      defaultStyle: "lowercase",
    }),
    Xi = Hi.extend({ implicit: [Wi, Gi, Yi, Ji] }),
    Qi = Xi,
    Zi = new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"),
    eo = new RegExp(
      "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$",
    );
  function vl(e) {
    return e === null ? !1 : Zi.exec(e) !== null || eo.exec(e) !== null;
  }
  function _l(e) {
    var r,
      t,
      n,
      i,
      o,
      s,
      a,
      u = 0,
      d = null,
      c,
      g,
      h;
    if (((r = Zi.exec(e)), r === null && (r = eo.exec(e)), r === null))
      throw new Error("Date resolve error");
    if (((t = +r[1]), (n = +r[2] - 1), (i = +r[3]), !r[4]))
      return new Date(Date.UTC(t, n, i));
    if (((o = +r[4]), (s = +r[5]), (a = +r[6]), r[7])) {
      for (u = r[7].slice(0, 3); u.length < 3; ) u += "0";
      u = +u;
    }
    return (
      r[9] &&
        ((c = +r[10]),
        (g = +(r[11] || 0)),
        (d = (c * 60 + g) * 6e4),
        r[9] === "-" && (d = -d)),
      (h = new Date(Date.UTC(t, n, i, o, s, a, u))),
      d && h.setTime(h.getTime() - d),
      h
    );
  }
  function $l(e) {
    return e.toISOString();
  }
  var ro = new Pe("tag:yaml.org,2002:timestamp", {
    kind: "scalar",
    resolve: vl,
    construct: _l,
    instanceOf: Date,
    represent: $l,
  });
  function wl(e) {
    return e === "<<" || e === null;
  }
  var to = new Pe("tag:yaml.org,2002:merge", { kind: "scalar", resolve: wl }),
    jn = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=
\r`;
  function bl(e) {
    if (e === null) return !1;
    var r,
      t,
      n = 0,
      i = e.length,
      o = jn;
    for (t = 0; t < i; t++)
      if (((r = o.indexOf(e.charAt(t))), !(r > 64))) {
        if (r < 0) return !1;
        n += 6;
      }
    return n % 8 === 0;
  }
  function El(e) {
    var r,
      t,
      n = e.replace(/[\r\n=]/g, ""),
      i = n.length,
      o = jn,
      s = 0,
      a = [];
    for (r = 0; r < i; r++)
      (r % 4 === 0 &&
        r &&
        (a.push((s >> 16) & 255), a.push((s >> 8) & 255), a.push(s & 255)),
        (s = (s << 6) | o.indexOf(n.charAt(r))));
    return (
      (t = (i % 4) * 6),
      t === 0
        ? (a.push((s >> 16) & 255), a.push((s >> 8) & 255), a.push(s & 255))
        : t === 18
          ? (a.push((s >> 10) & 255), a.push((s >> 2) & 255))
          : t === 12 && a.push((s >> 4) & 255),
      new Uint8Array(a)
    );
  }
  function Sl(e) {
    var r = "",
      t = 0,
      n,
      i,
      o = e.length,
      s = jn;
    for (n = 0; n < o; n++)
      (n % 3 === 0 &&
        n &&
        ((r += s[(t >> 18) & 63]),
        (r += s[(t >> 12) & 63]),
        (r += s[(t >> 6) & 63]),
        (r += s[t & 63])),
        (t = (t << 8) + e[n]));
    return (
      (i = o % 3),
      i === 0
        ? ((r += s[(t >> 18) & 63]),
          (r += s[(t >> 12) & 63]),
          (r += s[(t >> 6) & 63]),
          (r += s[t & 63]))
        : i === 2
          ? ((r += s[(t >> 10) & 63]),
            (r += s[(t >> 4) & 63]),
            (r += s[(t << 2) & 63]),
            (r += s[64]))
          : i === 1 &&
            ((r += s[(t >> 2) & 63]),
            (r += s[(t << 4) & 63]),
            (r += s[64]),
            (r += s[64])),
      r
    );
  }
  function Pl(e) {
    return Object.prototype.toString.call(e) === "[object Uint8Array]";
  }
  var no = new Pe("tag:yaml.org,2002:binary", {
      kind: "scalar",
      resolve: bl,
      construct: El,
      predicate: Pl,
      represent: Sl,
    }),
    Al = Object.prototype.hasOwnProperty,
    Il = Object.prototype.toString;
  function Rl(e) {
    if (e === null) return !0;
    var r = [],
      t,
      n,
      i,
      o,
      s,
      a = e;
    for (t = 0, n = a.length; t < n; t += 1) {
      if (((i = a[t]), (s = !1), Il.call(i) !== "[object Object]")) return !1;
      for (o in i)
        if (Al.call(i, o))
          if (!s) s = !0;
          else return !1;
      if (!s) return !1;
      if (r.indexOf(o) === -1) r.push(o);
      else return !1;
    }
    return !0;
  }
  function Ol(e) {
    return e !== null ? e : [];
  }
  var io = new Pe("tag:yaml.org,2002:omap", {
      kind: "sequence",
      resolve: Rl,
      construct: Ol,
    }),
    Nl = Object.prototype.toString;
  function xl(e) {
    if (e === null) return !0;
    var r,
      t,
      n,
      i,
      o,
      s = e;
    for (o = new Array(s.length), r = 0, t = s.length; r < t; r += 1) {
      if (
        ((n = s[r]),
        Nl.call(n) !== "[object Object]" ||
          ((i = Object.keys(n)), i.length !== 1))
      )
        return !1;
      o[r] = [i[0], n[i[0]]];
    }
    return !0;
  }
  function kl(e) {
    if (e === null) return [];
    var r,
      t,
      n,
      i,
      o,
      s = e;
    for (o = new Array(s.length), r = 0, t = s.length; r < t; r += 1)
      ((n = s[r]), (i = Object.keys(n)), (o[r] = [i[0], n[i[0]]]));
    return o;
  }
  var oo = new Pe("tag:yaml.org,2002:pairs", {
      kind: "sequence",
      resolve: xl,
      construct: kl,
    }),
    Tl = Object.prototype.hasOwnProperty;
  function Cl(e) {
    if (e === null) return !0;
    var r,
      t = e;
    for (r in t) if (Tl.call(t, r) && t[r] !== null) return !1;
    return !0;
  }
  function jl(e) {
    return e !== null ? e : {};
  }
  var so = new Pe("tag:yaml.org,2002:set", {
      kind: "mapping",
      resolve: Cl,
      construct: jl,
    }),
    Fn = Qi.extend({ implicit: [ro, to], explicit: [no, io, oo, so] }),
    fr = Object.prototype.hasOwnProperty,
    ut = 1,
    ao = 2,
    co = 3,
    ft = 4,
    Dn = 1,
    Fl = 2,
    lo = 3,
    Dl =
      /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/,
    Ml = /[\x85\u2028\u2029]/,
    ql = /[,\[\]\{\}]/,
    uo = /^(?:!|!!|![a-z\-]+!)$/i,
    fo =
      /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
  function po(e) {
    return Object.prototype.toString.call(e);
  }
  function Ze(e) {
    return e === 10 || e === 13;
  }
  function wr(e) {
    return e === 9 || e === 32;
  }
  function Ce(e) {
    return e === 9 || e === 32 || e === 10 || e === 13;
  }
  function kr(e) {
    return e === 44 || e === 91 || e === 93 || e === 123 || e === 125;
  }
  function Ll(e) {
    var r;
    return 48 <= e && e <= 57
      ? e - 48
      : ((r = e | 32), 97 <= r && r <= 102 ? r - 97 + 10 : -1);
  }
  function Bl(e) {
    return e === 120 ? 2 : e === 117 ? 4 : e === 85 ? 8 : 0;
  }
  function Ul(e) {
    return 48 <= e && e <= 57 ? e - 48 : -1;
  }
  function ho(e) {
    return e === 48
      ? "\0"
      : e === 97
        ? "\x07"
        : e === 98
          ? "\b"
          : e === 116 || e === 9
            ? "	"
            : e === 110
              ? `
`
              : e === 118
                ? "\v"
                : e === 102
                  ? "\f"
                  : e === 114
                    ? "\r"
                    : e === 101
                      ? "\x1B"
                      : e === 32
                        ? " "
                        : e === 34
                          ? '"'
                          : e === 47
                            ? "/"
                            : e === 92
                              ? "\\"
                              : e === 78
                                ? ""
                                : e === 95
                                  ? " "
                                  : e === 76
                                    ? "\u2028"
                                    : e === 80
                                      ? "\u2029"
                                      : "";
  }
  function Vl(e) {
    return e <= 65535
      ? String.fromCharCode(e)
      : String.fromCharCode(
          ((e - 65536) >> 10) + 55296,
          ((e - 65536) & 1023) + 56320,
        );
  }
  function mo(e, r, t) {
    r === "__proto__"
      ? Object.defineProperty(e, r, {
          configurable: !0,
          enumerable: !0,
          writable: !0,
          value: t,
        })
      : (e[r] = t);
  }
  for (var yo = new Array(256), go = new Array(256), Tr = 0; Tr < 256; Tr++)
    ((yo[Tr] = ho(Tr) ? 1 : 0), (go[Tr] = ho(Tr)));
  function zl(e, r) {
    ((this.input = e),
      (this.filename = r.filename || null),
      (this.schema = r.schema || Fn),
      (this.onWarning = r.onWarning || null),
      (this.legacy = r.legacy || !1),
      (this.json = r.json || !1),
      (this.listener = r.listener || null),
      (this.implicitTypes = this.schema.compiledImplicit),
      (this.typeMap = this.schema.compiledTypeMap),
      (this.length = e.length),
      (this.position = 0),
      (this.line = 0),
      (this.lineStart = 0),
      (this.lineIndent = 0),
      (this.firstTabInLine = -1),
      (this.documents = []));
  }
  function vo(e, r) {
    var t = {
      name: e.filename,
      buffer: e.input.slice(0, -1),
      position: e.position,
      line: e.line,
      column: e.position - e.lineStart,
    };
    return ((t.snippet = Gc(t)), new xe(r, t));
  }
  function ee(e, r) {
    throw vo(e, r);
  }
  function dt(e, r) {
    e.onWarning && e.onWarning.call(null, vo(e, r));
  }
  var _o = {
    YAML: function (r, t, n) {
      var i, o, s;
      (r.version !== null && ee(r, "duplication of %YAML directive"),
        n.length !== 1 && ee(r, "YAML directive accepts exactly one argument"),
        (i = /^([0-9]+)\.([0-9]+)$/.exec(n[0])),
        i === null && ee(r, "ill-formed argument of the YAML directive"),
        (o = parseInt(i[1], 10)),
        (s = parseInt(i[2], 10)),
        o !== 1 && ee(r, "unacceptable YAML version of the document"),
        (r.version = n[0]),
        (r.checkLineBreaks = s < 2),
        s !== 1 &&
          s !== 2 &&
          dt(r, "unsupported YAML version of the document"));
    },
    TAG: function (r, t, n) {
      var i, o;
      (n.length !== 2 && ee(r, "TAG directive accepts exactly two arguments"),
        (i = n[0]),
        (o = n[1]),
        uo.test(i) ||
          ee(r, "ill-formed tag handle (first argument) of the TAG directive"),
        fr.call(r.tagMap, i) &&
          ee(
            r,
            'there is a previously declared suffix for "' + i + '" tag handle',
          ),
        fo.test(o) ||
          ee(
            r,
            "ill-formed tag prefix (second argument) of the TAG directive",
          ));
      try {
        o = decodeURIComponent(o);
      } catch {
        ee(r, "tag prefix is malformed: " + o);
      }
      r.tagMap[i] = o;
    },
  };
  function dr(e, r, t, n) {
    var i, o, s, a;
    if (r < t) {
      if (((a = e.input.slice(r, t)), n))
        for (i = 0, o = a.length; i < o; i += 1)
          ((s = a.charCodeAt(i)),
            s === 9 ||
              (32 <= s && s <= 1114111) ||
              ee(e, "expected valid JSON character"));
      else Dl.test(a) && ee(e, "the stream contains non-printable characters");
      e.result += a;
    }
  }
  function $o(e, r, t, n) {
    var i, o, s, a;
    for (
      $e.isObject(t) ||
        ee(
          e,
          "cannot merge mappings; the provided source object is unacceptable",
        ),
        i = Object.keys(t),
        s = 0,
        a = i.length;
      s < a;
      s += 1
    )
      ((o = i[s]), fr.call(r, o) || (mo(r, o, t[o]), (n[o] = !0)));
  }
  function Cr(e, r, t, n, i, o, s, a, u) {
    var d, c;
    if (Array.isArray(i))
      for (
        i = Array.prototype.slice.call(i), d = 0, c = i.length;
        d < c;
        d += 1
      )
        (Array.isArray(i[d]) &&
          ee(e, "nested arrays are not supported inside keys"),
          typeof i == "object" &&
            po(i[d]) === "[object Object]" &&
            (i[d] = "[object Object]"));
    if (
      (typeof i == "object" &&
        po(i) === "[object Object]" &&
        (i = "[object Object]"),
      (i = String(i)),
      r === null && (r = {}),
      n === "tag:yaml.org,2002:merge")
    )
      if (Array.isArray(o))
        for (d = 0, c = o.length; d < c; d += 1) $o(e, r, o[d], t);
      else $o(e, r, o, t);
    else
      (!e.json &&
        !fr.call(t, i) &&
        fr.call(r, i) &&
        ((e.line = s || e.line),
        (e.lineStart = a || e.lineStart),
        (e.position = u || e.position),
        ee(e, "duplicated mapping key")),
        mo(r, i, o),
        delete t[i]);
    return r;
  }
  function Mn(e) {
    var r;
    ((r = e.input.charCodeAt(e.position)),
      r === 10
        ? e.position++
        : r === 13
          ? (e.position++,
            e.input.charCodeAt(e.position) === 10 && e.position++)
          : ee(e, "a line break is expected"),
      (e.line += 1),
      (e.lineStart = e.position),
      (e.firstTabInLine = -1));
  }
  function _e(e, r, t) {
    for (var n = 0, i = e.input.charCodeAt(e.position); i !== 0; ) {
      for (; wr(i); )
        (i === 9 && e.firstTabInLine === -1 && (e.firstTabInLine = e.position),
          (i = e.input.charCodeAt(++e.position)));
      if (r && i === 35)
        do i = e.input.charCodeAt(++e.position);
        while (i !== 10 && i !== 13 && i !== 0);
      if (Ze(i))
        for (
          Mn(e), i = e.input.charCodeAt(e.position), n++, e.lineIndent = 0;
          i === 32;
        )
          (e.lineIndent++, (i = e.input.charCodeAt(++e.position)));
      else break;
    }
    return (
      t !== -1 && n !== 0 && e.lineIndent < t && dt(e, "deficient indentation"),
      n
    );
  }
  function pt(e) {
    var r = e.position,
      t;
    return (
      (t = e.input.charCodeAt(r)),
      !!(
        (t === 45 || t === 46) &&
        t === e.input.charCodeAt(r + 1) &&
        t === e.input.charCodeAt(r + 2) &&
        ((r += 3), (t = e.input.charCodeAt(r)), t === 0 || Ce(t))
      )
    );
  }
  function qn(e, r) {
    r === 1
      ? (e.result += " ")
      : r > 1 &&
        (e.result += $e.repeat(
          `
`,
          r - 1,
        ));
  }
  function Kl(e, r, t) {
    var n,
      i,
      o,
      s,
      a,
      u,
      d,
      c,
      g = e.kind,
      h = e.result,
      p;
    if (
      ((p = e.input.charCodeAt(e.position)),
      Ce(p) ||
        kr(p) ||
        p === 35 ||
        p === 38 ||
        p === 42 ||
        p === 33 ||
        p === 124 ||
        p === 62 ||
        p === 39 ||
        p === 34 ||
        p === 37 ||
        p === 64 ||
        p === 96 ||
        ((p === 63 || p === 45) &&
          ((i = e.input.charCodeAt(e.position + 1)), Ce(i) || (t && kr(i)))))
    )
      return !1;
    for (
      e.kind = "scalar", e.result = "", o = s = e.position, a = !1;
      p !== 0;
    ) {
      if (p === 58) {
        if (((i = e.input.charCodeAt(e.position + 1)), Ce(i) || (t && kr(i))))
          break;
      } else if (p === 35) {
        if (((n = e.input.charCodeAt(e.position - 1)), Ce(n))) break;
      } else {
        if ((e.position === e.lineStart && pt(e)) || (t && kr(p))) break;
        if (Ze(p))
          if (
            ((u = e.line),
            (d = e.lineStart),
            (c = e.lineIndent),
            _e(e, !1, -1),
            e.lineIndent >= r)
          ) {
            ((a = !0), (p = e.input.charCodeAt(e.position)));
            continue;
          } else {
            ((e.position = s),
              (e.line = u),
              (e.lineStart = d),
              (e.lineIndent = c));
            break;
          }
      }
      (a &&
        (dr(e, o, s, !1), qn(e, e.line - u), (o = s = e.position), (a = !1)),
        wr(p) || (s = e.position + 1),
        (p = e.input.charCodeAt(++e.position)));
    }
    return (
      dr(e, o, s, !1),
      e.result ? !0 : ((e.kind = g), (e.result = h), !1)
    );
  }
  function Hl(e, r) {
    var t, n, i;
    if (((t = e.input.charCodeAt(e.position)), t !== 39)) return !1;
    for (
      e.kind = "scalar", e.result = "", e.position++, n = i = e.position;
      (t = e.input.charCodeAt(e.position)) !== 0;
    )
      if (t === 39)
        if (
          (dr(e, n, e.position, !0),
          (t = e.input.charCodeAt(++e.position)),
          t === 39)
        )
          ((n = e.position), e.position++, (i = e.position));
        else return !0;
      else
        Ze(t)
          ? (dr(e, n, i, !0), qn(e, _e(e, !1, r)), (n = i = e.position))
          : e.position === e.lineStart && pt(e)
            ? ee(
                e,
                "unexpected end of the document within a single quoted scalar",
              )
            : (e.position++, (i = e.position));
    ee(e, "unexpected end of the stream within a single quoted scalar");
  }
  function Wl(e, r) {
    var t, n, i, o, s, a;
    if (((a = e.input.charCodeAt(e.position)), a !== 34)) return !1;
    for (
      e.kind = "scalar", e.result = "", e.position++, t = n = e.position;
      (a = e.input.charCodeAt(e.position)) !== 0;
    ) {
      if (a === 34) return (dr(e, t, e.position, !0), e.position++, !0);
      if (a === 92) {
        if (
          (dr(e, t, e.position, !0),
          (a = e.input.charCodeAt(++e.position)),
          Ze(a))
        )
          _e(e, !1, r);
        else if (a < 256 && yo[a]) ((e.result += go[a]), e.position++);
        else if ((s = Bl(a)) > 0) {
          for (i = s, o = 0; i > 0; i--)
            ((a = e.input.charCodeAt(++e.position)),
              (s = Ll(a)) >= 0
                ? (o = (o << 4) + s)
                : ee(e, "expected hexadecimal character"));
          ((e.result += Vl(o)), e.position++);
        } else ee(e, "unknown escape sequence");
        t = n = e.position;
      } else
        Ze(a)
          ? (dr(e, t, n, !0), qn(e, _e(e, !1, r)), (t = n = e.position))
          : e.position === e.lineStart && pt(e)
            ? ee(
                e,
                "unexpected end of the document within a double quoted scalar",
              )
            : (e.position++, (n = e.position));
    }
    ee(e, "unexpected end of the stream within a double quoted scalar");
  }
  function Gl(e, r) {
    var t = !0,
      n,
      i,
      o,
      s = e.tag,
      a,
      u = e.anchor,
      d,
      c,
      g,
      h,
      p,
      v = Object.create(null),
      w,
      y,
      _,
      m;
    if (((m = e.input.charCodeAt(e.position)), m === 91))
      ((c = 93), (p = !1), (a = []));
    else if (m === 123) ((c = 125), (p = !0), (a = {}));
    else return !1;
    for (
      e.anchor !== null && (e.anchorMap[e.anchor] = a),
        m = e.input.charCodeAt(++e.position);
      m !== 0;
    ) {
      if ((_e(e, !0, r), (m = e.input.charCodeAt(e.position)), m === c))
        return (
          e.position++,
          (e.tag = s),
          (e.anchor = u),
          (e.kind = p ? "mapping" : "sequence"),
          (e.result = a),
          !0
        );
      (t
        ? m === 44 && ee(e, "expected the node content, but found ','")
        : ee(e, "missed comma between flow collection entries"),
        (y = w = _ = null),
        (g = h = !1),
        m === 63 &&
          ((d = e.input.charCodeAt(e.position + 1)),
          Ce(d) && ((g = h = !0), e.position++, _e(e, !0, r))),
        (n = e.line),
        (i = e.lineStart),
        (o = e.position),
        jr(e, r, ut, !1, !0),
        (y = e.tag),
        (w = e.result),
        _e(e, !0, r),
        (m = e.input.charCodeAt(e.position)),
        (h || e.line === n) &&
          m === 58 &&
          ((g = !0),
          (m = e.input.charCodeAt(++e.position)),
          _e(e, !0, r),
          jr(e, r, ut, !1, !0),
          (_ = e.result)),
        p
          ? Cr(e, a, v, y, w, _, n, i, o)
          : g
            ? a.push(Cr(e, null, v, y, w, _, n, i, o))
            : a.push(w),
        _e(e, !0, r),
        (m = e.input.charCodeAt(e.position)),
        m === 44
          ? ((t = !0), (m = e.input.charCodeAt(++e.position)))
          : (t = !1));
    }
    ee(e, "unexpected end of the stream within a flow collection");
  }
  function Yl(e, r) {
    var t,
      n,
      i = Dn,
      o = !1,
      s = !1,
      a = r,
      u = 0,
      d = !1,
      c,
      g;
    if (((g = e.input.charCodeAt(e.position)), g === 124)) n = !1;
    else if (g === 62) n = !0;
    else return !1;
    for (e.kind = "scalar", e.result = ""; g !== 0; )
      if (((g = e.input.charCodeAt(++e.position)), g === 43 || g === 45))
        Dn === i
          ? (i = g === 43 ? lo : Fl)
          : ee(e, "repeat of a chomping mode identifier");
      else if ((c = Ul(g)) >= 0)
        c === 0
          ? ee(
              e,
              "bad explicit indentation width of a block scalar; it cannot be less than one",
            )
          : s
            ? ee(e, "repeat of an indentation width identifier")
            : ((a = r + c - 1), (s = !0));
      else break;
    if (wr(g)) {
      do g = e.input.charCodeAt(++e.position);
      while (wr(g));
      if (g === 35)
        do g = e.input.charCodeAt(++e.position);
        while (!Ze(g) && g !== 0);
    }
    for (; g !== 0; ) {
      for (
        Mn(e), e.lineIndent = 0, g = e.input.charCodeAt(e.position);
        (!s || e.lineIndent < a) && g === 32;
      )
        (e.lineIndent++, (g = e.input.charCodeAt(++e.position)));
      if ((!s && e.lineIndent > a && (a = e.lineIndent), Ze(g))) {
        u++;
        continue;
      }
      if (e.lineIndent < a) {
        i === lo
          ? (e.result += $e.repeat(
              `
`,
              o ? 1 + u : u,
            ))
          : i === Dn &&
            o &&
            (e.result += `
`);
        break;
      }
      for (
        n
          ? wr(g)
            ? ((d = !0),
              (e.result += $e.repeat(
                `
`,
                o ? 1 + u : u,
              )))
            : d
              ? ((d = !1),
                (e.result += $e.repeat(
                  `
`,
                  u + 1,
                )))
              : u === 0
                ? o && (e.result += " ")
                : (e.result += $e.repeat(
                    `
`,
                    u,
                  ))
          : (e.result += $e.repeat(
              `
`,
              o ? 1 + u : u,
            )),
          o = !0,
          s = !0,
          u = 0,
          t = e.position;
        !Ze(g) && g !== 0;
      )
        g = e.input.charCodeAt(++e.position);
      dr(e, t, e.position, !1);
    }
    return !0;
  }
  function wo(e, r) {
    var t,
      n = e.tag,
      i = e.anchor,
      o = [],
      s,
      a = !1,
      u;
    if (e.firstTabInLine !== -1) return !1;
    for (
      e.anchor !== null && (e.anchorMap[e.anchor] = o),
        u = e.input.charCodeAt(e.position);
      u !== 0 &&
      (e.firstTabInLine !== -1 &&
        ((e.position = e.firstTabInLine),
        ee(e, "tab characters must not be used in indentation")),
      !(u !== 45 || ((s = e.input.charCodeAt(e.position + 1)), !Ce(s))));
    ) {
      if (((a = !0), e.position++, _e(e, !0, -1) && e.lineIndent <= r)) {
        (o.push(null), (u = e.input.charCodeAt(e.position)));
        continue;
      }
      if (
        ((t = e.line),
        jr(e, r, co, !1, !0),
        o.push(e.result),
        _e(e, !0, -1),
        (u = e.input.charCodeAt(e.position)),
        (e.line === t || e.lineIndent > r) && u !== 0)
      )
        ee(e, "bad indentation of a sequence entry");
      else if (e.lineIndent < r) break;
    }
    return a
      ? ((e.tag = n), (e.anchor = i), (e.kind = "sequence"), (e.result = o), !0)
      : !1;
  }
  function Jl(e, r, t) {
    var n,
      i,
      o,
      s,
      a,
      u,
      d = e.tag,
      c = e.anchor,
      g = {},
      h = Object.create(null),
      p = null,
      v = null,
      w = null,
      y = !1,
      _ = !1,
      m;
    if (e.firstTabInLine !== -1) return !1;
    for (
      e.anchor !== null && (e.anchorMap[e.anchor] = g),
        m = e.input.charCodeAt(e.position);
      m !== 0;
    ) {
      if (
        (!y &&
          e.firstTabInLine !== -1 &&
          ((e.position = e.firstTabInLine),
          ee(e, "tab characters must not be used in indentation")),
        (n = e.input.charCodeAt(e.position + 1)),
        (o = e.line),
        (m === 63 || m === 58) && Ce(n))
      )
        (m === 63
          ? (y && (Cr(e, g, h, p, v, null, s, a, u), (p = v = w = null)),
            (_ = !0),
            (y = !0),
            (i = !0))
          : y
            ? ((y = !1), (i = !0))
            : ee(
                e,
                "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line",
              ),
          (e.position += 1),
          (m = n));
      else {
        if (
          ((s = e.line),
          (a = e.lineStart),
          (u = e.position),
          !jr(e, t, ao, !1, !0))
        )
          break;
        if (e.line === o) {
          for (m = e.input.charCodeAt(e.position); wr(m); )
            m = e.input.charCodeAt(++e.position);
          if (m === 58)
            ((m = e.input.charCodeAt(++e.position)),
              Ce(m) ||
                ee(
                  e,
                  "a whitespace character is expected after the key-value separator within a block mapping",
                ),
              y && (Cr(e, g, h, p, v, null, s, a, u), (p = v = w = null)),
              (_ = !0),
              (y = !1),
              (i = !1),
              (p = e.tag),
              (v = e.result));
          else if (_)
            ee(e, "can not read an implicit mapping pair; a colon is missed");
          else return ((e.tag = d), (e.anchor = c), !0);
        } else if (_)
          ee(
            e,
            "can not read a block mapping entry; a multiline key may not be an implicit key",
          );
        else return ((e.tag = d), (e.anchor = c), !0);
      }
      if (
        ((e.line === o || e.lineIndent > r) &&
          (y && ((s = e.line), (a = e.lineStart), (u = e.position)),
          jr(e, r, ft, !0, i) && (y ? (v = e.result) : (w = e.result)),
          y || (Cr(e, g, h, p, v, w, s, a, u), (p = v = w = null)),
          _e(e, !0, -1),
          (m = e.input.charCodeAt(e.position))),
        (e.line === o || e.lineIndent > r) && m !== 0)
      )
        ee(e, "bad indentation of a mapping entry");
      else if (e.lineIndent < r) break;
    }
    return (
      y && Cr(e, g, h, p, v, null, s, a, u),
      _ && ((e.tag = d), (e.anchor = c), (e.kind = "mapping"), (e.result = g)),
      _
    );
  }
  function Xl(e) {
    var r,
      t = !1,
      n = !1,
      i,
      o,
      s;
    if (((s = e.input.charCodeAt(e.position)), s !== 33)) return !1;
    if (
      (e.tag !== null && ee(e, "duplication of a tag property"),
      (s = e.input.charCodeAt(++e.position)),
      s === 60
        ? ((t = !0), (s = e.input.charCodeAt(++e.position)))
        : s === 33
          ? ((n = !0), (i = "!!"), (s = e.input.charCodeAt(++e.position)))
          : (i = "!"),
      (r = e.position),
      t)
    ) {
      do s = e.input.charCodeAt(++e.position);
      while (s !== 0 && s !== 62);
      e.position < e.length
        ? ((o = e.input.slice(r, e.position)),
          (s = e.input.charCodeAt(++e.position)))
        : ee(e, "unexpected end of the stream within a verbatim tag");
    } else {
      for (; s !== 0 && !Ce(s); )
        (s === 33 &&
          (n
            ? ee(e, "tag suffix cannot contain exclamation marks")
            : ((i = e.input.slice(r - 1, e.position + 1)),
              uo.test(i) ||
                ee(e, "named tag handle cannot contain such characters"),
              (n = !0),
              (r = e.position + 1))),
          (s = e.input.charCodeAt(++e.position)));
      ((o = e.input.slice(r, e.position)),
        ql.test(o) &&
          ee(e, "tag suffix cannot contain flow indicator characters"));
    }
    o && !fo.test(o) && ee(e, "tag name cannot contain such characters: " + o);
    try {
      o = decodeURIComponent(o);
    } catch {
      ee(e, "tag name is malformed: " + o);
    }
    return (
      t
        ? (e.tag = o)
        : fr.call(e.tagMap, i)
          ? (e.tag = e.tagMap[i] + o)
          : i === "!"
            ? (e.tag = "!" + o)
            : i === "!!"
              ? (e.tag = "tag:yaml.org,2002:" + o)
              : ee(e, 'undeclared tag handle "' + i + '"'),
      !0
    );
  }
  function Ql(e) {
    var r, t;
    if (((t = e.input.charCodeAt(e.position)), t !== 38)) return !1;
    for (
      e.anchor !== null && ee(e, "duplication of an anchor property"),
        t = e.input.charCodeAt(++e.position),
        r = e.position;
      t !== 0 && !Ce(t) && !kr(t);
    )
      t = e.input.charCodeAt(++e.position);
    return (
      e.position === r &&
        ee(e, "name of an anchor node must contain at least one character"),
      (e.anchor = e.input.slice(r, e.position)),
      !0
    );
  }
  function Zl(e) {
    var r, t, n;
    if (((n = e.input.charCodeAt(e.position)), n !== 42)) return !1;
    for (
      n = e.input.charCodeAt(++e.position), r = e.position;
      n !== 0 && !Ce(n) && !kr(n);
    )
      n = e.input.charCodeAt(++e.position);
    return (
      e.position === r &&
        ee(e, "name of an alias node must contain at least one character"),
      (t = e.input.slice(r, e.position)),
      fr.call(e.anchorMap, t) || ee(e, 'unidentified alias "' + t + '"'),
      (e.result = e.anchorMap[t]),
      _e(e, !0, -1),
      !0
    );
  }
  function jr(e, r, t, n, i) {
    var o,
      s,
      a,
      u = 1,
      d = !1,
      c = !1,
      g,
      h,
      p,
      v,
      w,
      y;
    if (
      (e.listener !== null && e.listener("open", e),
      (e.tag = null),
      (e.anchor = null),
      (e.kind = null),
      (e.result = null),
      (o = s = a = ft === t || co === t),
      n &&
        _e(e, !0, -1) &&
        ((d = !0),
        e.lineIndent > r
          ? (u = 1)
          : e.lineIndent === r
            ? (u = 0)
            : e.lineIndent < r && (u = -1)),
      u === 1)
    )
      for (; Xl(e) || Ql(e); )
        _e(e, !0, -1)
          ? ((d = !0),
            (a = o),
            e.lineIndent > r
              ? (u = 1)
              : e.lineIndent === r
                ? (u = 0)
                : e.lineIndent < r && (u = -1))
          : (a = !1);
    if (
      (a && (a = d || i),
      (u === 1 || ft === t) &&
        (ut === t || ao === t ? (w = r) : (w = r + 1),
        (y = e.position - e.lineStart),
        u === 1
          ? (a && (wo(e, y) || Jl(e, y, w))) || Gl(e, w)
            ? (c = !0)
            : ((s && Yl(e, w)) || Hl(e, w) || Wl(e, w)
                ? (c = !0)
                : Zl(e)
                  ? ((c = !0),
                    (e.tag !== null || e.anchor !== null) &&
                      ee(e, "alias node should not have any properties"))
                  : Kl(e, w, ut === t) &&
                    ((c = !0), e.tag === null && (e.tag = "?")),
              e.anchor !== null && (e.anchorMap[e.anchor] = e.result))
          : u === 0 && (c = a && wo(e, y))),
      e.tag === null)
    )
      e.anchor !== null && (e.anchorMap[e.anchor] = e.result);
    else if (e.tag === "?") {
      for (
        e.result !== null &&
          e.kind !== "scalar" &&
          ee(
            e,
            'unacceptable node kind for !<?> tag; it should be "scalar", not "' +
              e.kind +
              '"',
          ),
          g = 0,
          h = e.implicitTypes.length;
        g < h;
        g += 1
      )
        if (((v = e.implicitTypes[g]), v.resolve(e.result))) {
          ((e.result = v.construct(e.result)),
            (e.tag = v.tag),
            e.anchor !== null && (e.anchorMap[e.anchor] = e.result));
          break;
        }
    } else if (e.tag !== "!") {
      if (fr.call(e.typeMap[e.kind || "fallback"], e.tag))
        v = e.typeMap[e.kind || "fallback"][e.tag];
      else
        for (
          v = null,
            p = e.typeMap.multi[e.kind || "fallback"],
            g = 0,
            h = p.length;
          g < h;
          g += 1
        )
          if (e.tag.slice(0, p[g].tag.length) === p[g].tag) {
            v = p[g];
            break;
          }
      (v || ee(e, "unknown tag !<" + e.tag + ">"),
        e.result !== null &&
          v.kind !== e.kind &&
          ee(
            e,
            "unacceptable node kind for !<" +
              e.tag +
              '> tag; it should be "' +
              v.kind +
              '", not "' +
              e.kind +
              '"',
          ),
        v.resolve(e.result, e.tag)
          ? ((e.result = v.construct(e.result, e.tag)),
            e.anchor !== null && (e.anchorMap[e.anchor] = e.result))
          : ee(e, "cannot resolve a node with !<" + e.tag + "> explicit tag"));
    }
    return (
      e.listener !== null && e.listener("close", e),
      e.tag !== null || e.anchor !== null || c
    );
  }
  function eu(e) {
    var r = e.position,
      t,
      n,
      i,
      o = !1,
      s;
    for (
      e.version = null,
        e.checkLineBreaks = e.legacy,
        e.tagMap = Object.create(null),
        e.anchorMap = Object.create(null);
      (s = e.input.charCodeAt(e.position)) !== 0 &&
      (_e(e, !0, -1),
      (s = e.input.charCodeAt(e.position)),
      !(e.lineIndent > 0 || s !== 37));
    ) {
      for (
        o = !0, s = e.input.charCodeAt(++e.position), t = e.position;
        s !== 0 && !Ce(s);
      )
        s = e.input.charCodeAt(++e.position);
      for (
        n = e.input.slice(t, e.position),
          i = [],
          n.length < 1 &&
            ee(
              e,
              "directive name must not be less than one character in length",
            );
        s !== 0;
      ) {
        for (; wr(s); ) s = e.input.charCodeAt(++e.position);
        if (s === 35) {
          do s = e.input.charCodeAt(++e.position);
          while (s !== 0 && !Ze(s));
          break;
        }
        if (Ze(s)) break;
        for (t = e.position; s !== 0 && !Ce(s); )
          s = e.input.charCodeAt(++e.position);
        i.push(e.input.slice(t, e.position));
      }
      (s !== 0 && Mn(e),
        fr.call(_o, n)
          ? _o[n](e, n, i)
          : dt(e, 'unknown document directive "' + n + '"'));
    }
    if (
      (_e(e, !0, -1),
      e.lineIndent === 0 &&
      e.input.charCodeAt(e.position) === 45 &&
      e.input.charCodeAt(e.position + 1) === 45 &&
      e.input.charCodeAt(e.position + 2) === 45
        ? ((e.position += 3), _e(e, !0, -1))
        : o && ee(e, "directives end mark is expected"),
      jr(e, e.lineIndent - 1, ft, !1, !0),
      _e(e, !0, -1),
      e.checkLineBreaks &&
        Ml.test(e.input.slice(r, e.position)) &&
        dt(e, "non-ASCII line breaks are interpreted as content"),
      e.documents.push(e.result),
      e.position === e.lineStart && pt(e))
    ) {
      e.input.charCodeAt(e.position) === 46 &&
        ((e.position += 3), _e(e, !0, -1));
      return;
    }
    if (e.position < e.length - 1)
      ee(e, "end of the stream or a document separator is expected");
    else return;
  }
  function bo(e, r) {
    ((e = String(e)),
      (r = r || {}),
      e.length !== 0 &&
        (e.charCodeAt(e.length - 1) !== 10 &&
          e.charCodeAt(e.length - 1) !== 13 &&
          (e += `
`),
        e.charCodeAt(0) === 65279 && (e = e.slice(1))));
    var t = new zl(e, r),
      n = e.indexOf("\0");
    for (
      n !== -1 &&
        ((t.position = n), ee(t, "null byte is not allowed in input")),
        t.input += "\0";
      t.input.charCodeAt(t.position) === 32;
    )
      ((t.lineIndent += 1), (t.position += 1));
    for (; t.position < t.length - 1; ) eu(t);
    return t.documents;
  }
  function ru(e, r, t) {
    r !== null &&
      typeof r == "object" &&
      typeof t > "u" &&
      ((t = r), (r = null));
    var n = bo(e, t);
    if (typeof r != "function") return n;
    for (var i = 0, o = n.length; i < o; i += 1) r(n[i]);
  }
  function tu(e, r) {
    var t = bo(e, r);
    if (t.length !== 0) {
      if (t.length === 1) return t[0];
      throw new xe("expected a single document in the stream, but found more");
    }
  }
  var nu = ru,
    iu = tu,
    Eo = { loadAll: nu, load: iu },
    So = Object.prototype.toString,
    Po = Object.prototype.hasOwnProperty,
    Ln = 65279,
    ou = 9,
    Yr = 10,
    su = 13,
    au = 32,
    cu = 33,
    lu = 34,
    Bn = 35,
    uu = 37,
    fu = 38,
    du = 39,
    pu = 42,
    Ao = 44,
    hu = 45,
    ht = 58,
    mu = 61,
    yu = 62,
    gu = 63,
    vu = 64,
    Io = 91,
    Ro = 93,
    _u = 96,
    Oo = 123,
    $u = 124,
    No = 125,
    Oe = {};
  ((Oe[0] = "\\0"),
    (Oe[7] = "\\a"),
    (Oe[8] = "\\b"),
    (Oe[9] = "\\t"),
    (Oe[10] = "\\n"),
    (Oe[11] = "\\v"),
    (Oe[12] = "\\f"),
    (Oe[13] = "\\r"),
    (Oe[27] = "\\e"),
    (Oe[34] = '\\"'),
    (Oe[92] = "\\\\"),
    (Oe[133] = "\\N"),
    (Oe[160] = "\\_"),
    (Oe[8232] = "\\L"),
    (Oe[8233] = "\\P"));
  var wu = [
      "y",
      "Y",
      "yes",
      "Yes",
      "YES",
      "on",
      "On",
      "ON",
      "n",
      "N",
      "no",
      "No",
      "NO",
      "off",
      "Off",
      "OFF",
    ],
    bu = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
  function Eu(e, r) {
    var t, n, i, o, s, a, u;
    if (r === null) return {};
    for (t = {}, n = Object.keys(r), i = 0, o = n.length; i < o; i += 1)
      ((s = n[i]),
        (a = String(r[s])),
        s.slice(0, 2) === "!!" && (s = "tag:yaml.org,2002:" + s.slice(2)),
        (u = e.compiledTypeMap.fallback[s]),
        u && Po.call(u.styleAliases, a) && (a = u.styleAliases[a]),
        (t[s] = a));
    return t;
  }
  function Su(e) {
    var r, t, n;
    if (((r = e.toString(16).toUpperCase()), e <= 255)) ((t = "x"), (n = 2));
    else if (e <= 65535) ((t = "u"), (n = 4));
    else if (e <= 4294967295) ((t = "U"), (n = 8));
    else
      throw new xe(
        "code point within a string may not be greater than 0xFFFFFFFF",
      );
    return "\\" + t + $e.repeat("0", n - r.length) + r;
  }
  var Pu = 1,
    Jr = 2;
  function Au(e) {
    ((this.schema = e.schema || Fn),
      (this.indent = Math.max(1, e.indent || 2)),
      (this.noArrayIndent = e.noArrayIndent || !1),
      (this.skipInvalid = e.skipInvalid || !1),
      (this.flowLevel = $e.isNothing(e.flowLevel) ? -1 : e.flowLevel),
      (this.styleMap = Eu(this.schema, e.styles || null)),
      (this.sortKeys = e.sortKeys || !1),
      (this.lineWidth = e.lineWidth || 80),
      (this.noRefs = e.noRefs || !1),
      (this.noCompatMode = e.noCompatMode || !1),
      (this.condenseFlow = e.condenseFlow || !1),
      (this.quotingType = e.quotingType === '"' ? Jr : Pu),
      (this.forceQuotes = e.forceQuotes || !1),
      (this.replacer = typeof e.replacer == "function" ? e.replacer : null),
      (this.implicitTypes = this.schema.compiledImplicit),
      (this.explicitTypes = this.schema.compiledExplicit),
      (this.tag = null),
      (this.result = ""),
      (this.duplicates = []),
      (this.usedDuplicates = null));
  }
  function xo(e, r) {
    for (
      var t = $e.repeat(" ", r), n = 0, i = -1, o = "", s, a = e.length;
      n < a;
    )
      ((i = e.indexOf(
        `
`,
        n,
      )),
        i === -1
          ? ((s = e.slice(n)), (n = a))
          : ((s = e.slice(n, i + 1)), (n = i + 1)),
        s.length &&
          s !==
            `
` &&
          (o += t),
        (o += s));
    return o;
  }
  function Un(e, r) {
    return (
      `
` + $e.repeat(" ", e.indent * r)
    );
  }
  function Iu(e, r) {
    var t, n, i;
    for (t = 0, n = e.implicitTypes.length; t < n; t += 1)
      if (((i = e.implicitTypes[t]), i.resolve(r))) return !0;
    return !1;
  }
  function mt(e) {
    return e === au || e === ou;
  }
  function Xr(e) {
    return (
      (32 <= e && e <= 126) ||
      (161 <= e && e <= 55295 && e !== 8232 && e !== 8233) ||
      (57344 <= e && e <= 65533 && e !== Ln) ||
      (65536 <= e && e <= 1114111)
    );
  }
  function ko(e) {
    return Xr(e) && e !== Ln && e !== su && e !== Yr;
  }
  function To(e, r, t) {
    var n = ko(e),
      i = n && !mt(e);
    return (
      ((t
        ? n
        : n && e !== Ao && e !== Io && e !== Ro && e !== Oo && e !== No) &&
        e !== Bn &&
        !(r === ht && !i)) ||
      (ko(r) && !mt(r) && e === Bn) ||
      (r === ht && i)
    );
  }
  function Ru(e) {
    return (
      Xr(e) &&
      e !== Ln &&
      !mt(e) &&
      e !== hu &&
      e !== gu &&
      e !== ht &&
      e !== Ao &&
      e !== Io &&
      e !== Ro &&
      e !== Oo &&
      e !== No &&
      e !== Bn &&
      e !== fu &&
      e !== pu &&
      e !== cu &&
      e !== $u &&
      e !== mu &&
      e !== yu &&
      e !== du &&
      e !== lu &&
      e !== uu &&
      e !== vu &&
      e !== _u
    );
  }
  function Ou(e) {
    return !mt(e) && e !== ht;
  }
  function Qr(e, r) {
    var t = e.charCodeAt(r),
      n;
    return t >= 55296 &&
      t <= 56319 &&
      r + 1 < e.length &&
      ((n = e.charCodeAt(r + 1)), n >= 56320 && n <= 57343)
      ? (t - 55296) * 1024 + n - 56320 + 65536
      : t;
  }
  function Co(e) {
    var r = /^\n* /;
    return r.test(e);
  }
  var jo = 1,
    Vn = 2,
    Fo = 3,
    Do = 4,
    Fr = 5;
  function Nu(e, r, t, n, i, o, s, a) {
    var u,
      d = 0,
      c = null,
      g = !1,
      h = !1,
      p = n !== -1,
      v = -1,
      w = Ru(Qr(e, 0)) && Ou(Qr(e, e.length - 1));
    if (r || s)
      for (u = 0; u < e.length; d >= 65536 ? (u += 2) : u++) {
        if (((d = Qr(e, u)), !Xr(d))) return Fr;
        ((w = w && To(d, c, a)), (c = d));
      }
    else {
      for (u = 0; u < e.length; d >= 65536 ? (u += 2) : u++) {
        if (((d = Qr(e, u)), d === Yr))
          ((g = !0),
            p && ((h = h || (u - v - 1 > n && e[v + 1] !== " ")), (v = u)));
        else if (!Xr(d)) return Fr;
        ((w = w && To(d, c, a)), (c = d));
      }
      h = h || (p && u - v - 1 > n && e[v + 1] !== " ");
    }
    return !g && !h
      ? w && !s && !i(e)
        ? jo
        : o === Jr
          ? Fr
          : Vn
      : t > 9 && Co(e)
        ? Fr
        : s
          ? o === Jr
            ? Fr
            : Vn
          : h
            ? Do
            : Fo;
  }
  function xu(e, r, t, n, i) {
    e.dump = (function () {
      if (r.length === 0) return e.quotingType === Jr ? '""' : "''";
      if (!e.noCompatMode && (wu.indexOf(r) !== -1 || bu.test(r)))
        return e.quotingType === Jr ? '"' + r + '"' : "'" + r + "'";
      var o = e.indent * Math.max(1, t),
        s =
          e.lineWidth === -1
            ? -1
            : Math.max(Math.min(e.lineWidth, 40), e.lineWidth - o),
        a = n || (e.flowLevel > -1 && t >= e.flowLevel);
      function u(d) {
        return Iu(e, d);
      }
      switch (Nu(r, a, e.indent, s, u, e.quotingType, e.forceQuotes && !n, i)) {
        case jo:
          return r;
        case Vn:
          return "'" + r.replace(/'/g, "''") + "'";
        case Fo:
          return "|" + Mo(r, e.indent) + qo(xo(r, o));
        case Do:
          return ">" + Mo(r, e.indent) + qo(xo(ku(r, s), o));
        case Fr:
          return '"' + Tu(r) + '"';
        default:
          throw new xe("impossible error: invalid scalar style");
      }
    })();
  }
  function Mo(e, r) {
    var t = Co(e) ? String(r) : "",
      n =
        e[e.length - 1] ===
        `
`,
      i =
        n &&
        (e[e.length - 2] ===
          `
` ||
          e ===
            `
`),
      o = i ? "+" : n ? "" : "-";
    return (
      t +
      o +
      `
`
    );
  }
  function qo(e) {
    return e[e.length - 1] ===
      `
`
      ? e.slice(0, -1)
      : e;
  }
  function ku(e, r) {
    for (
      var t = /(\n+)([^\n]*)/g,
        n = (function () {
          var d = e.indexOf(`
`);
          return (
            (d = d !== -1 ? d : e.length),
            (t.lastIndex = d),
            Lo(e.slice(0, d), r)
          );
        })(),
        i =
          e[0] ===
            `
` || e[0] === " ",
        o,
        s;
      (s = t.exec(e));
    ) {
      var a = s[1],
        u = s[2];
      ((o = u[0] === " "),
        (n +=
          a +
          (!i && !o && u !== ""
            ? `
`
            : "") +
          Lo(u, r)),
        (i = o));
    }
    return n;
  }
  function Lo(e, r) {
    if (e === "" || e[0] === " ") return e;
    for (var t = / [^ ]/g, n, i = 0, o, s = 0, a = 0, u = ""; (n = t.exec(e)); )
      ((a = n.index),
        a - i > r &&
          ((o = s > i ? s : a),
          (u +=
            `
` + e.slice(i, o)),
          (i = o + 1)),
        (s = a));
    return (
      (u += `
`),
      e.length - i > r && s > i
        ? (u +=
            e.slice(i, s) +
            `
` +
            e.slice(s + 1))
        : (u += e.slice(i)),
      u.slice(1)
    );
  }
  function Tu(e) {
    for (var r = "", t = 0, n, i = 0; i < e.length; t >= 65536 ? (i += 2) : i++)
      ((t = Qr(e, i)),
        (n = Oe[t]),
        !n && Xr(t)
          ? ((r += e[i]), t >= 65536 && (r += e[i + 1]))
          : (r += n || Su(t)));
    return r;
  }
  function Cu(e, r, t) {
    var n = "",
      i = e.tag,
      o,
      s,
      a;
    for (o = 0, s = t.length; o < s; o += 1)
      ((a = t[o]),
        e.replacer && (a = e.replacer.call(t, String(o), a)),
        (ir(e, r, a, !1, !1) || (typeof a > "u" && ir(e, r, null, !1, !1))) &&
          (n !== "" && (n += "," + (e.condenseFlow ? "" : " ")),
          (n += e.dump)));
    ((e.tag = i), (e.dump = "[" + n + "]"));
  }
  function Bo(e, r, t, n) {
    var i = "",
      o = e.tag,
      s,
      a,
      u;
    for (s = 0, a = t.length; s < a; s += 1)
      ((u = t[s]),
        e.replacer && (u = e.replacer.call(t, String(s), u)),
        (ir(e, r + 1, u, !0, !0, !1, !0) ||
          (typeof u > "u" && ir(e, r + 1, null, !0, !0, !1, !0))) &&
          ((!n || i !== "") && (i += Un(e, r)),
          e.dump && Yr === e.dump.charCodeAt(0) ? (i += "-") : (i += "- "),
          (i += e.dump)));
    ((e.tag = o), (e.dump = i || "[]"));
  }
  function ju(e, r, t) {
    var n = "",
      i = e.tag,
      o = Object.keys(t),
      s,
      a,
      u,
      d,
      c;
    for (s = 0, a = o.length; s < a; s += 1)
      ((c = ""),
        n !== "" && (c += ", "),
        e.condenseFlow && (c += '"'),
        (u = o[s]),
        (d = t[u]),
        e.replacer && (d = e.replacer.call(t, u, d)),
        ir(e, r, u, !1, !1) &&
          (e.dump.length > 1024 && (c += "? "),
          (c +=
            e.dump +
            (e.condenseFlow ? '"' : "") +
            ":" +
            (e.condenseFlow ? "" : " ")),
          ir(e, r, d, !1, !1) && ((c += e.dump), (n += c))));
    ((e.tag = i), (e.dump = "{" + n + "}"));
  }
  function Fu(e, r, t, n) {
    var i = "",
      o = e.tag,
      s = Object.keys(t),
      a,
      u,
      d,
      c,
      g,
      h;
    if (e.sortKeys === !0) s.sort();
    else if (typeof e.sortKeys == "function") s.sort(e.sortKeys);
    else if (e.sortKeys)
      throw new xe("sortKeys must be a boolean or a function");
    for (a = 0, u = s.length; a < u; a += 1)
      ((h = ""),
        (!n || i !== "") && (h += Un(e, r)),
        (d = s[a]),
        (c = t[d]),
        e.replacer && (c = e.replacer.call(t, d, c)),
        ir(e, r + 1, d, !0, !0, !0) &&
          ((g =
            (e.tag !== null && e.tag !== "?") ||
            (e.dump && e.dump.length > 1024)),
          g &&
            (e.dump && Yr === e.dump.charCodeAt(0) ? (h += "?") : (h += "? ")),
          (h += e.dump),
          g && (h += Un(e, r)),
          ir(e, r + 1, c, !0, g) &&
            (e.dump && Yr === e.dump.charCodeAt(0) ? (h += ":") : (h += ": "),
            (h += e.dump),
            (i += h))));
    ((e.tag = o), (e.dump = i || "{}"));
  }
  function Uo(e, r, t) {
    var n, i, o, s, a, u;
    for (
      i = t ? e.explicitTypes : e.implicitTypes, o = 0, s = i.length;
      o < s;
      o += 1
    )
      if (
        ((a = i[o]),
        (a.instanceOf || a.predicate) &&
          (!a.instanceOf ||
            (typeof r == "object" && r instanceof a.instanceOf)) &&
          (!a.predicate || a.predicate(r)))
      ) {
        if (
          (t
            ? a.multi && a.representName
              ? (e.tag = a.representName(r))
              : (e.tag = a.tag)
            : (e.tag = "?"),
          a.represent)
        ) {
          if (
            ((u = e.styleMap[a.tag] || a.defaultStyle),
            So.call(a.represent) === "[object Function]")
          )
            n = a.represent(r, u);
          else if (Po.call(a.represent, u)) n = a.represent[u](r, u);
          else
            throw new xe(
              "!<" + a.tag + '> tag resolver accepts not "' + u + '" style',
            );
          e.dump = n;
        }
        return !0;
      }
    return !1;
  }
  function ir(e, r, t, n, i, o, s) {
    ((e.tag = null), (e.dump = t), Uo(e, t, !1) || Uo(e, t, !0));
    var a = So.call(e.dump),
      u = n,
      d;
    n && (n = e.flowLevel < 0 || e.flowLevel > r);
    var c = a === "[object Object]" || a === "[object Array]",
      g,
      h;
    if (
      (c && ((g = e.duplicates.indexOf(t)), (h = g !== -1)),
      ((e.tag !== null && e.tag !== "?") || h || (e.indent !== 2 && r > 0)) &&
        (i = !1),
      h && e.usedDuplicates[g])
    )
      e.dump = "*ref_" + g;
    else {
      if (
        (c && h && !e.usedDuplicates[g] && (e.usedDuplicates[g] = !0),
        a === "[object Object]")
      )
        n && Object.keys(e.dump).length !== 0
          ? (Fu(e, r, e.dump, i), h && (e.dump = "&ref_" + g + e.dump))
          : (ju(e, r, e.dump), h && (e.dump = "&ref_" + g + " " + e.dump));
      else if (a === "[object Array]")
        n && e.dump.length !== 0
          ? (e.noArrayIndent && !s && r > 0
              ? Bo(e, r - 1, e.dump, i)
              : Bo(e, r, e.dump, i),
            h && (e.dump = "&ref_" + g + e.dump))
          : (Cu(e, r, e.dump), h && (e.dump = "&ref_" + g + " " + e.dump));
      else if (a === "[object String]") e.tag !== "?" && xu(e, e.dump, r, o, u);
      else {
        if (a === "[object Undefined]") return !1;
        if (e.skipInvalid) return !1;
        throw new xe("unacceptable kind of an object to dump " + a);
      }
      e.tag !== null &&
        e.tag !== "?" &&
        ((d = encodeURI(e.tag[0] === "!" ? e.tag.slice(1) : e.tag).replace(
          /!/g,
          "%21",
        )),
        e.tag[0] === "!"
          ? (d = "!" + d)
          : d.slice(0, 18) === "tag:yaml.org,2002:"
            ? (d = "!!" + d.slice(18))
            : (d = "!<" + d + ">"),
        (e.dump = d + " " + e.dump));
    }
    return !0;
  }
  function Du(e, r) {
    var t = [],
      n = [],
      i,
      o;
    for (zn(e, t, n), i = 0, o = n.length; i < o; i += 1)
      r.duplicates.push(t[n[i]]);
    r.usedDuplicates = new Array(o);
  }
  function zn(e, r, t) {
    var n, i, o;
    if (e !== null && typeof e == "object")
      if (((i = r.indexOf(e)), i !== -1)) t.indexOf(i) === -1 && t.push(i);
      else if ((r.push(e), Array.isArray(e)))
        for (i = 0, o = e.length; i < o; i += 1) zn(e[i], r, t);
      else
        for (n = Object.keys(e), i = 0, o = n.length; i < o; i += 1)
          zn(e[n[i]], r, t);
  }
  function Mu(e, r) {
    r = r || {};
    var t = new Au(r);
    t.noRefs || Du(e, t);
    var n = e;
    return (
      t.replacer && (n = t.replacer.call({ "": n }, "", n)),
      ir(t, 0, n, !0, !0)
        ? t.dump +
          `
`
        : ""
    );
  }
  var qu = Mu,
    Lu = { dump: qu };
  function Kn(e, r) {
    return function () {
      throw new Error(
        "Function yaml." +
          e +
          " is removed in js-yaml 4. Use yaml." +
          r +
          " instead, which is now safe by default.",
      );
    };
  }
  var Bu = Pe,
    Uu = Ui,
    Vu = Hi,
    Vo = Xi,
    zu = Qi,
    Ku = Fn,
    Hu = Eo.load,
    Wu = Eo.loadAll,
    Gu = Lu.dump,
    Yu = xe,
    Ju = {
      binary: no,
      float: Ji,
      map: Ki,
      null: Wi,
      pairs: oo,
      set: so,
      timestamp: ro,
      bool: Gi,
      int: Yi,
      merge: to,
      omap: io,
      seq: zi,
      str: Vi,
    },
    Xu = Kn("safeLoad", "load"),
    Qu = Kn("safeLoadAll", "loadAll"),
    Zu = Kn("safeDump", "dump"),
    zo = {
      Type: Bu,
      Schema: Uu,
      FAILSAFE_SCHEMA: Vu,
      JSON_SCHEMA: Vo,
      CORE_SCHEMA: zu,
      DEFAULT_SCHEMA: Ku,
      load: Hu,
      loadAll: Wu,
      dump: Gu,
      YAMLException: Yu,
      types: Ju,
      safeLoad: Xu,
      safeLoadAll: Qu,
      safeDump: Zu,
    };
  const ef = {
      order: 200,
      allowEmpty: !0,
      canParse: [".yaml", ".yml", ".json"],
      async parse(e) {
        let r = e.data;
        if ((Be.isBuffer(r) && (r = r.toString()), typeof r == "string"))
          try {
            return zo.load(r, { schema: Vo });
          } catch {
            try {
              return zo.load(r);
            } catch (t) {
              throw new Nr(t?.message || "Parser Error", e.url);
            }
          }
        else return r;
      },
    },
    rf = /\.(txt|htm|html|md|xml|js|min|map|css|scss|less|svg)$/i,
    tf = {
      order: 300,
      allowEmpty: !0,
      encoding: "utf8",
      canParse(e) {
        return (
          (typeof e.data == "string" || Be.isBuffer(e.data)) && rf.test(e.url)
        );
      },
      parse(e) {
        if (typeof e.data == "string") return e.data;
        if (Be.isBuffer(e.data)) return e.data.toString(this.encoding);
        throw new Nr("data is not text", e.url);
      },
    },
    nf = /\.(jpeg|jpg|gif|png|bmp|ico)$/i,
    of = {
      order: 400,
      allowEmpty: !0,
      canParse(e) {
        return Be.isBuffer(e.data) && nf.test(e.url);
      },
      parse(e) {
        return Be.isBuffer(e.data) ? e.data : Be.from(e.data);
      },
    },
    sf = {
      order: 100,
      canRead(e) {
        return Ei(e.url);
      },
      async read(e) {
        let r;
        const t = await Promise.resolve().then(() => hp);
        try {
          r = Nn(e.url);
        } catch (n) {
          const i = n;
          throw (
            (i.message = `Malformed URI: ${e.url}: ${i.message}`),
            new xr(i, e.url)
          );
        }
        (r.endsWith("/") || r.endsWith("\\")) && (r = r.slice(0, -1));
        try {
          return await t.promises.readFile(r);
        } catch (n) {
          const i = n;
          throw (
            (i.message = `Error opening file ${r}: ${i.message}`),
            new xr(i, r)
          );
        }
      },
    },
    af = {
      order: 200,
      headers: null,
      timeout: 6e4,
      redirects: 5,
      withCredentials: !1,
      safeUrlResolver: !0,
      canRead(e) {
        return hc(e.url) && (!this.safeUrlResolver || !mc(e.url));
      },
      read(e) {
        const r = at(e.url);
        return (
          typeof window < "u" &&
            !r.protocol &&
            (r.protocol = at(location.href).protocol),
          Ko(r, this)
        );
      },
    };
  async function Ko(e, r, t) {
    e = at(e);
    const n = t || [];
    n.push(e.href);
    try {
      const i = await cf(e, r);
      if (i.status >= 400) {
        const o = new Error(`HTTP ERROR ${i.status}`);
        throw ((o.status = i.status), o);
      } else if (i.status >= 300)
        if (!Number.isNaN(r.redirects) && n.length > r.redirects) {
          const o = new Error(`Error downloading ${n[0]}. 
Too many redirects: 
  ${n.join(` 
  `)}`);
          throw ((o.status = i.status), new xr(o));
        } else if (!("location" in i.headers) || !i.headers.location) {
          const o = new Error(
            `HTTP ${i.status} redirect with no location header`,
          );
          throw ((o.status = i.status), o);
        } else {
          const o = Qe(e.href, i.headers.location);
          return Ko(o, r, n);
        }
      else {
        if (i.body) {
          const o = await i.arrayBuffer();
          return Be.from(o);
        }
        return Be.alloc(0);
      }
    } catch (i) {
      const o = i;
      throw (
        (o.message = `Error downloading ${e.href}: ${o.message}`),
        new xr(o, e.href)
      );
    }
  }
  async function cf(e, r) {
    let t, n;
    r.timeout &&
      typeof AbortController < "u" &&
      ((t = new AbortController()),
      (n = setTimeout(() => t.abort(), r.timeout)));
    const i = await fetch(e, {
      method: "GET",
      headers: r.headers || {},
      credentials: r.withCredentials ? "include" : "same-origin",
      signal: t ? t.signal : null,
    });
    return (n && clearTimeout(n), i);
  }
  const lf = () => ({
      parse: {
        json: { ...jc },
        yaml: { ...ef },
        text: { ...tf },
        binary: { ...of },
      },
      resolve: { file: { ...sf }, http: { ...af }, external: !0 },
      continueOnError: !1,
      bundle: { excludedPathMatcher: () => !1 },
      dereference: {
        circular: !0,
        excludedPathMatcher: () => !1,
        referenceResolution: "relative",
        mergeKeys: !0,
      },
      mutateInputSchema: !0,
    }),
    uf = (e) => {
      const r = lf();
      return (e && Ho(r, e), r);
    };
  function Ho(e, r) {
    if (Wo(r)) {
      const t = Object.keys(r).filter(
        (n) => !["__proto__", "constructor", "prototype"].includes(n),
      );
      for (let n = 0; n < t.length; n++) {
        const i = t[n],
          o = r[i],
          s = e[i];
        Wo(o) ? (e[i] = Ho(s || {}, o)) : o !== void 0 && (e[i] = o);
      }
    }
    return e;
  }
  function Wo(e) {
    return (
      e &&
      typeof e == "object" &&
      !Array.isArray(e) &&
      !(e instanceof RegExp) &&
      !(e instanceof Date)
    );
  }
  function yt(e) {
    let r, t, n, i;
    const o = Array.prototype.slice.call(e);
    (typeof o[o.length - 1] == "function" && (i = o.pop()),
      typeof o[0] == "string"
        ? ((r = o[0]),
          typeof o[2] == "object"
            ? ((t = o[1]), (n = o[2]))
            : ((t = void 0), (n = o[1])))
        : ((r = ""), (t = o[0]), (n = o[1])));
    try {
      n = uf(n);
    } catch (s) {
      console.error(`JSON Schema Ref Parser: Error normalizing options: ${s}`);
    }
    return (
      !n.mutateInputSchema &&
        typeof t == "object" &&
        (t = JSON.parse(JSON.stringify(t))),
      { path: r, schema: t, options: n, callback: i }
    );
  }
  function ff(e, r) {
    if (!r.resolve?.external) return Promise.resolve();
    try {
      const t = Hn(e.schema, e.$refs._root$Ref.path + "#", e.$refs, r);
      return Promise.all(t);
    } catch (t) {
      return Promise.reject(t);
    }
  }
  function Hn(e, r, t, n, i, o) {
    i ||= new Set();
    let s = [];
    if (e && typeof e == "object" && !ArrayBuffer.isView(e) && !i.has(e)) {
      (i.add(e), Se.isExternal$Ref(e) && s.push(df(e, r, t, n)));
      const a = Object.keys(e);
      for (const u of a) {
        const d = Re.join(r, u),
          c = e[u];
        s = s.concat(Hn(c, d, t, n, i));
      }
    }
    return s;
  }
  async function df(e, r, t, n) {
    const i = n.dereference?.externalReferenceResolution === "root",
      o = Qe(i ? ct() : r, e.$ref),
      s = Le(o),
      a = t._$refs[s];
    if (a) return Promise.resolve(a.value);
    try {
      const u = await Mi(o, t, n),
        d = Hn(u, s + "#", t, n, new Set(), !0);
      return Promise.all(d);
    } catch (u) {
      if (!n?.continueOnError || !Wr(u)) throw u;
      return (
        t._$refs[s] && ((u.source = decodeURI(Le(r))), (u.path = Si(Kr(r)))),
        []
      );
    }
  }
  function pf(e, r) {
    const t = [];
    (Wn(e, "schema", e.$refs._root$Ref.path + "#", "#", 0, t, e.$refs, r),
      hf(t, r));
  }
  function Wn(e, r, t, n, i, o, s, a) {
    const u = r === null ? e : e[r],
      d = a.bundle || {},
      c = d.excludedPathMatcher || (() => !1);
    if (u && typeof u == "object" && !ArrayBuffer.isView(u) && !c(n))
      if (Se.isAllowed$Ref(u)) Go(e, r, t, n, i, o, s, a);
      else {
        const g = Object.keys(u).sort((h, p) =>
          h === "definitions" || h === "$defs"
            ? -1
            : p === "definitions" || p === "$defs"
              ? 1
              : h.length - p.length,
        );
        for (const h of g) {
          const p = Re.join(t, h),
            v = Re.join(n, h),
            w = u[h];
          (Se.isAllowed$Ref(w)
            ? Go(u, h, t, v, i, o, s, a)
            : Wn(u, h, p, v, i, o, s, a),
            w &&
              typeof w == "object" &&
              !Array.isArray(w) &&
              "$ref" in w &&
              d?.onBundle?.(w.$ref, u[h], u, h));
        }
      }
  }
  function Go(e, r, t, n, i, o, s, a) {
    const u = r === null ? e : e[r],
      d = Qe(t, u.$ref),
      c = s._resolve(d, n, a);
    if (c === null) return;
    const h = Re.parse(n).length,
      p = Le(c.path),
      v = Kr(c.path),
      w = p !== s._root$Ref.path,
      y = Se.isExtended$Ref(u);
    i += c.indirections;
    const _ = mf(o, e, r);
    if (_)
      if (h < _.depth || i < _.indirections) yf(o, _);
      else return;
    (o.push({
      $ref: u,
      parent: e,
      key: r,
      pathFromRoot: n,
      depth: h,
      file: p,
      hash: v,
      value: c.value,
      circular: c.circular,
      extended: y,
      external: w,
      indirections: i,
    }),
      (!_ || w) && Wn(c.value, null, c.path, n, i + 1, o, s, a));
  }
  function hf(e, r) {
    e.sort((o, s) => {
      if (o.file !== s.file) return o.file < s.file ? -1 : 1;
      if (o.hash !== s.hash) return o.hash < s.hash ? -1 : 1;
      if (o.circular !== s.circular) return o.circular ? -1 : 1;
      if (o.extended !== s.extended) return o.extended ? 1 : -1;
      if (o.indirections !== s.indirections)
        return o.indirections - s.indirections;
      if (o.depth !== s.depth) return o.depth - s.depth;
      {
        const a = Math.max(
            o.pathFromRoot.lastIndexOf("/definitions"),
            o.pathFromRoot.lastIndexOf("/$defs"),
          ),
          u = Math.max(
            s.pathFromRoot.lastIndexOf("/definitions"),
            s.pathFromRoot.lastIndexOf("/$defs"),
          );
        return a !== u ? u - a : o.pathFromRoot.length - s.pathFromRoot.length;
      }
    });
    let t, n, i;
    for (const o of e)
      o.external
        ? o.file === t && o.hash === n
          ? (o.$ref.$ref = i)
          : o.file === t && o.hash.indexOf(n + "/") === 0
            ? (o.$ref.$ref = Re.join(i, Re.parse(o.hash.replace(n, "#"))))
            : ((t = o.file),
              (n = o.hash),
              (i = o.pathFromRoot),
              (o.$ref = o.parent[o.key] = Se.dereference(o.$ref, o.value, r)),
              o.circular && (o.$ref.$ref = o.pathFromRoot))
        : (o.$ref.$ref = o.hash);
  }
  function mf(e, r, t) {
    for (const n of e) if (n && n.parent === r && n.key === t) return n;
  }
  function yf(e, r) {
    const t = e.indexOf(r);
    e.splice(t, 1);
  }
  function gf(e, r) {
    const t = Date.now(),
      n = Gn(
        e.schema,
        e.$refs._root$Ref.path,
        "#",
        new Set(),
        new Set(),
        new Map(),
        e.$refs,
        r,
        t,
      );
    ((e.$refs.circular = n.circular), (e.schema = n.value));
  }
  function Gn(e, r, t, n, i, o, s, a, u) {
    let d;
    const c = { value: e, circular: !1 };
    Jo(u, a);
    const g = a.dereference || {},
      h = g.excludedPathMatcher || (() => !1);
    if (
      (g?.circular === "ignore" || !i.has(e)) &&
      e &&
      typeof e == "object" &&
      !ArrayBuffer.isView(e) &&
      !h(t)
    ) {
      if ((n.add(e), i.add(e), Se.isAllowed$Ref(e, a)))
        ((d = Yo(e, r, t, n, i, o, s, a, u)),
          (c.circular = d.circular),
          (c.value = d.value));
      else
        for (const p of Object.keys(e)) {
          Jo(u, a);
          const v = Re.join(r, p),
            w = Re.join(t, p);
          if (h(w)) continue;
          const y = e[p];
          let _ = !1;
          if (Se.isAllowed$Ref(y, a)) {
            if (
              ((d = Yo(y, v, w, n, i, o, s, a, u)),
              (_ = d.circular),
              e[p] !== d.value)
            ) {
              const m = new Map();
              (g?.preservedProperties &&
                typeof e[p] == "object" &&
                !Array.isArray(e[p]) &&
                g?.preservedProperties.forEach(($) => {
                  $ in e[p] && m.set($, e[p][$]);
                }),
                (e[p] = d.value),
                g?.preservedProperties &&
                  m.size &&
                  typeof e[p] == "object" &&
                  !Array.isArray(e[p]) &&
                  m.forEach(($, P) => {
                    e[p][P] = $;
                  }),
                g?.onDereference?.(y.$ref, e[p], e, p));
            }
          } else
            n.has(y)
              ? (_ = gt(v, s, a))
              : ((d = Gn(y, v, w, n, i, o, s, a, u)),
                (_ = d.circular),
                e[p] !== d.value && (e[p] = d.value));
          c.circular = c.circular || _;
        }
      n.delete(e);
    }
    return c;
  }
  function Yo(e, r, t, n, i, o, s, a, u) {
    const c =
        Se.isExternal$Ref(e) &&
        a?.dereference?.externalReferenceResolution === "root",
      g = Qe(c ? ct() : r, e.$ref),
      h = o.get(g);
    if (h) {
      if (!h.circular) {
        const m = Object.keys(e);
        if (m.length > 1) {
          const $ = {};
          for (const P of m) P !== "$ref" && !(P in h.value) && ($[P] = e[P]);
          return { circular: h.circular, value: Object.assign({}, h.value, $) };
        }
        return h;
      }
      if (typeof h.value == "object" && "$ref" in h.value && "$ref" in e) {
        if (h.value.$ref === e.$ref) return (gt(r, s, a), h);
      } else return (gt(r, s, a), h);
    }
    const p = s._resolve(g, r, a);
    if (p === null) return { circular: !1, value: null };
    const v = p.circular;
    let w = v || n.has(p.value);
    w && gt(r, s, a);
    let y = Se.dereference(e, p.value, a);
    if (!w) {
      const m = Gn(y, p.path, t, n, i, o, s, a, u);
      ((w = m.circular), (y = m.value));
    }
    (w && !v && a.dereference?.circular === "ignore" && (y = e),
      v && (y.$ref = t));
    const _ = { circular: w, value: y };
    return (Object.keys(e).length === 1 && o.set(g, _), _);
  }
  function Jo(e, r) {
    if (r && r.timeoutMs && Date.now() - e > r.timeoutMs)
      throw new Ac(r.timeoutMs);
  }
  function gt(e, r, t) {
    if (
      ((r.circular = !0),
      t?.dereference?.onCircular?.(e),
      !t.dereference.circular)
    )
      throw new ReferenceError(`Circular $ref pointer found at ${e}`);
    return !0;
  }
  function vf() {
    return typeof ur == "object" && typeof ur.nextTick == "function"
      ? ur.nextTick
      : typeof setImmediate == "function"
        ? setImmediate
        : function (r) {
            setTimeout(r, 0);
          };
  }
  const Xo = vf();
  function Ue(e, r) {
    if (e) {
      r.then(
        function (t) {
          Xo(function () {
            e(null, t);
          });
        },
        function (t) {
          Xo(function () {
            e(t);
          });
        },
      );
      return;
    } else return r;
  }
  class br {
    schema = null;
    $refs = new xi();
    async parse() {
      const r = yt(arguments);
      let t;
      if (!r.path && !r.schema) {
        const i = new Error(
          `Expected a file path, URL, or object. Got ${r.path || r.schema}`,
        );
        return Ue(r.callback, Promise.reject(i));
      }
      ((this.schema = null), (this.$refs = new xi()));
      let n = "http";
      if (Ei(r.path)) ((r.path = vc(r.path)), (n = "file"));
      else if (!r.path && r.schema && "$id" in r.schema && r.schema.$id) {
        const i = at(r.schema.$id),
          o = i.port ?? (i.protocol === "https:" ? 443 : 80);
        r.path = `${i.protocol}//${i.hostname}:${o}`;
      }
      if (
        ((r.path = Qe(ct(), r.path)), r.schema && typeof r.schema == "object")
      ) {
        const i = this.$refs._add(r.path);
        ((i.value = r.schema),
          (i.pathType = n),
          (t = Promise.resolve(r.schema)));
      } else t = Mi(r.path, this.$refs, r.options);
      try {
        const i = await t;
        if (i !== null && typeof i == "object" && !Be.isBuffer(i))
          return (
            (this.schema = i),
            Ue(r.callback, Promise.resolve(this.schema))
          );
        if (r.options.continueOnError)
          return (
            (this.schema = null),
            Ue(r.callback, Promise.resolve(this.schema))
          );
        throw new SyntaxError(
          `"${this.$refs._root$Ref.path || i}" is not a valid JSON Schema`,
        );
      } catch (i) {
        return !r.options.continueOnError || !Wr(i)
          ? Ue(r.callback, Promise.reject(i))
          : (this.$refs._$refs[Le(r.path)] &&
              this.$refs._$refs[Le(r.path)].addError(i),
            Ue(r.callback, Promise.resolve(null)));
      }
    }
    static parse() {
      const r = new br();
      return r.parse.apply(r, arguments);
    }
    async resolve() {
      const r = yt(arguments);
      try {
        return (
          await this.parse(r.path, r.schema, r.options),
          await ff(this, r.options),
          Yn(this),
          Ue(r.callback, Promise.resolve(this.$refs))
        );
      } catch (t) {
        return Ue(r.callback, Promise.reject(t));
      }
    }
    static resolve() {
      const r = new br();
      return r.resolve.apply(r, arguments);
    }
    static bundle() {
      const r = new br();
      return r.bundle.apply(r, arguments);
    }
    async bundle() {
      const r = yt(arguments);
      try {
        return (
          await this.resolve(r.path, r.schema, r.options),
          pf(this, r.options),
          Yn(this),
          Ue(r.callback, Promise.resolve(this.schema))
        );
      } catch (t) {
        return Ue(r.callback, Promise.reject(t));
      }
    }
    static dereference() {
      const r = new br();
      return r.dereference.apply(r, arguments);
    }
    async dereference() {
      const r = yt(arguments);
      try {
        return (
          await this.resolve(r.path, r.schema, r.options),
          gf(this, r.options),
          Yn(this),
          Ue(r.callback, Promise.resolve(this.schema))
        );
      } catch (t) {
        return Ue(r.callback, Promise.reject(t));
      }
    }
  }
  function Yn(e) {
    if (Hr.getParserErrors(e).length > 0) throw new Hr(e);
  }
  const Qo = {
    keys: {},
    descriptions: {},
    ui: {
      add_item: "Add Item",
      remove: "Remove",
      add_property: "Add Property",
      additional_properties: "Additional Properties",
      type_variant: "Type / Variant",
      error_schema_load:
        "Error: Could not load or parse the schema. See console for details.",
      unsupported_type: "Unsupported type",
    },
  };
  let er = JSON.parse(JSON.stringify(Qo));
  function _f(e) {
    (e.keys && (er.keys = { ...er.keys, ...e.keys }),
      e.descriptions &&
        (er.descriptions = { ...er.descriptions, ...e.descriptions }),
      e.ui && (er.ui = { ...er.ui, ...e.ui }));
  }
  function $f() {
    er = JSON.parse(JSON.stringify(Qo));
  }
  function pr(e, r = "") {
    return er.ui[e] ?? r;
  }
  function Zo(e, r = "") {
    return er.keys[e] ?? r;
  }
  function wf(e, r = "") {
    return er.descriptions[e] ?? r;
  }
  const es = {
    sorting: {
      defaultPriority: [
        "name",
        "id",
        "title",
        "type",
        "enabled",
        "active",
        "url",
        "brokers",
        "username",
        "password",
        "topic",
        "group",
        "key",
        "value",
        "required",
      ],
      perObjectPriority: {},
      defaultRenderLast: [],
    },
    visibility: { hiddenPaths: [], hiddenKeys: [], customVisibility: void 0 },
    parser: {
      titleCandidates: [
        "type",
        "name",
        "kind",
        "id",
        "mode",
        "strategy",
        "action",
        "method",
        "service",
        "provider",
      ],
    },
    layout: { groups: {} },
    html: { skipRootFromName: !1 },
  };
  let or = JSON.parse(JSON.stringify(es));
  function rs(e) {
    for (const r in e)
      if (
        Object.prototype.hasOwnProperty.call(e, r) &&
        Object.prototype.hasOwnProperty.call(or, r)
      ) {
        const t = r;
        or[t] = { ...or[t], ...e[t] };
      }
  }
  function bf() {
    or = JSON.parse(JSON.stringify(es));
  }
  function ts(e) {
    return e &&
      e.__esModule &&
      Object.prototype.hasOwnProperty.call(e, "default")
      ? e.default
      : e;
  }
  var vt = { exports: {} },
    Jn = {},
    sr = {},
    Er = {},
    Xn = {},
    Qn = {},
    Zn = {},
    ns;
  function _t() {
    return (
      ns ||
        ((ns = 1),
        (function (e) {
          (Object.defineProperty(e, "__esModule", { value: !0 }),
            (e.regexpCode =
              e.getEsmExportName =
              e.getProperty =
              e.safeStringify =
              e.stringify =
              e.strConcat =
              e.addCodeArg =
              e.str =
              e._ =
              e.nil =
              e._Code =
              e.Name =
              e.IDENTIFIER =
              e._CodeOrName =
                void 0));
          class r {}
          ((e._CodeOrName = r), (e.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i));
          class t extends r {
            constructor(m) {
              if ((super(), !e.IDENTIFIER.test(m)))
                throw new Error("CodeGen: name must be a valid identifier");
              this.str = m;
            }
            toString() {
              return this.str;
            }
            emptyStr() {
              return !1;
            }
            get names() {
              return { [this.str]: 1 };
            }
          }
          e.Name = t;
          class n extends r {
            constructor(m) {
              (super(), (this._items = typeof m == "string" ? [m] : m));
            }
            toString() {
              return this.str;
            }
            emptyStr() {
              if (this._items.length > 1) return !1;
              const m = this._items[0];
              return m === "" || m === '""';
            }
            get str() {
              var m;
              return (m = this._str) !== null && m !== void 0
                ? m
                : (this._str = this._items.reduce(($, P) => `${$}${P}`, ""));
            }
            get names() {
              var m;
              return (m = this._names) !== null && m !== void 0
                ? m
                : (this._names = this._items.reduce(
                    ($, P) => (
                      P instanceof t && ($[P.str] = ($[P.str] || 0) + 1),
                      $
                    ),
                    {},
                  ));
            }
          }
          ((e._Code = n), (e.nil = new n("")));
          function i(_, ...m) {
            const $ = [_[0]];
            let P = 0;
            for (; P < m.length; ) (a($, m[P]), $.push(_[++P]));
            return new n($);
          }
          e._ = i;
          const o = new n("+");
          function s(_, ...m) {
            const $ = [p(_[0])];
            let P = 0;
            for (; P < m.length; )
              ($.push(o), a($, m[P]), $.push(o, p(_[++P])));
            return (u($), new n($));
          }
          e.str = s;
          function a(_, m) {
            m instanceof n
              ? _.push(...m._items)
              : m instanceof t
                ? _.push(m)
                : _.push(g(m));
          }
          e.addCodeArg = a;
          function u(_) {
            let m = 1;
            for (; m < _.length - 1; ) {
              if (_[m] === o) {
                const $ = d(_[m - 1], _[m + 1]);
                if ($ !== void 0) {
                  _.splice(m - 1, 3, $);
                  continue;
                }
                _[m++] = "+";
              }
              m++;
            }
          }
          function d(_, m) {
            if (m === '""') return _;
            if (_ === '""') return m;
            if (typeof _ == "string")
              return m instanceof t || _[_.length - 1] !== '"'
                ? void 0
                : typeof m != "string"
                  ? `${_.slice(0, -1)}${m}"`
                  : m[0] === '"'
                    ? _.slice(0, -1) + m.slice(1)
                    : void 0;
            if (typeof m == "string" && m[0] === '"' && !(_ instanceof t))
              return `"${_}${m.slice(1)}`;
          }
          function c(_, m) {
            return m.emptyStr() ? _ : _.emptyStr() ? m : s`${_}${m}`;
          }
          e.strConcat = c;
          function g(_) {
            return typeof _ == "number" || typeof _ == "boolean" || _ === null
              ? _
              : p(Array.isArray(_) ? _.join(",") : _);
          }
          function h(_) {
            return new n(p(_));
          }
          e.stringify = h;
          function p(_) {
            return JSON.stringify(_)
              .replace(/\u2028/g, "\\u2028")
              .replace(/\u2029/g, "\\u2029");
          }
          e.safeStringify = p;
          function v(_) {
            return typeof _ == "string" && e.IDENTIFIER.test(_)
              ? new n(`.${_}`)
              : i`[${_}]`;
          }
          e.getProperty = v;
          function w(_) {
            if (typeof _ == "string" && e.IDENTIFIER.test(_))
              return new n(`${_}`);
            throw new Error(
              `CodeGen: invalid export name: ${_}, use explicit $id name mapping`,
            );
          }
          e.getEsmExportName = w;
          function y(_) {
            return new n(_.toString());
          }
          e.regexpCode = y;
        })(Zn)),
      Zn
    );
  }
  var ei = {},
    is;
  function os() {
    return (
      is ||
        ((is = 1),
        (function (e) {
          (Object.defineProperty(e, "__esModule", { value: !0 }),
            (e.ValueScope =
              e.ValueScopeName =
              e.Scope =
              e.varKinds =
              e.UsedValueState =
                void 0));
          const r = _t();
          class t extends Error {
            constructor(d) {
              (super(`CodeGen: "code" for ${d} not defined`),
                (this.value = d.value));
            }
          }
          var n;
          ((function (u) {
            ((u[(u.Started = 0)] = "Started"),
              (u[(u.Completed = 1)] = "Completed"));
          })(n || (e.UsedValueState = n = {})),
            (e.varKinds = {
              const: new r.Name("const"),
              let: new r.Name("let"),
              var: new r.Name("var"),
            }));
          class i {
            constructor({ prefixes: d, parent: c } = {}) {
              ((this._names = {}), (this._prefixes = d), (this._parent = c));
            }
            toName(d) {
              return d instanceof r.Name ? d : this.name(d);
            }
            name(d) {
              return new r.Name(this._newName(d));
            }
            _newName(d) {
              const c = this._names[d] || this._nameGroup(d);
              return `${d}${c.index++}`;
            }
            _nameGroup(d) {
              var c, g;
              if (
                (!(
                  (g =
                    (c = this._parent) === null || c === void 0
                      ? void 0
                      : c._prefixes) === null || g === void 0
                ) &&
                  g.has(d)) ||
                (this._prefixes && !this._prefixes.has(d))
              )
                throw new Error(
                  `CodeGen: prefix "${d}" is not allowed in this scope`,
                );
              return (this._names[d] = { prefix: d, index: 0 });
            }
          }
          e.Scope = i;
          class o extends r.Name {
            constructor(d, c) {
              (super(c), (this.prefix = d));
            }
            setValue(d, { property: c, itemIndex: g }) {
              ((this.value = d),
                (this.scopePath = (0, r._)`.${new r.Name(c)}[${g}]`));
            }
          }
          e.ValueScopeName = o;
          const s = (0, r._)`\n`;
          class a extends i {
            constructor(d) {
              (super(d),
                (this._values = {}),
                (this._scope = d.scope),
                (this.opts = { ...d, _n: d.lines ? s : r.nil }));
            }
            get() {
              return this._scope;
            }
            name(d) {
              return new o(d, this._newName(d));
            }
            value(d, c) {
              var g;
              if (c.ref === void 0)
                throw new Error("CodeGen: ref must be passed in value");
              const h = this.toName(d),
                { prefix: p } = h,
                v = (g = c.key) !== null && g !== void 0 ? g : c.ref;
              let w = this._values[p];
              if (w) {
                const m = w.get(v);
                if (m) return m;
              } else w = this._values[p] = new Map();
              w.set(v, h);
              const y = this._scope[p] || (this._scope[p] = []),
                _ = y.length;
              return (
                (y[_] = c.ref),
                h.setValue(c, { property: p, itemIndex: _ }),
                h
              );
            }
            getValue(d, c) {
              const g = this._values[d];
              if (g) return g.get(c);
            }
            scopeRefs(d, c = this._values) {
              return this._reduceValues(c, (g) => {
                if (g.scopePath === void 0)
                  throw new Error(`CodeGen: name "${g}" has no value`);
                return (0, r._)`${d}${g.scopePath}`;
              });
            }
            scopeCode(d = this._values, c, g) {
              return this._reduceValues(
                d,
                (h) => {
                  if (h.value === void 0)
                    throw new Error(`CodeGen: name "${h}" has no value`);
                  return h.value.code;
                },
                c,
                g,
              );
            }
            _reduceValues(d, c, g = {}, h) {
              let p = r.nil;
              for (const v in d) {
                const w = d[v];
                if (!w) continue;
                const y = (g[v] = g[v] || new Map());
                w.forEach((_) => {
                  if (y.has(_)) return;
                  y.set(_, n.Started);
                  let m = c(_);
                  if (m) {
                    const $ = this.opts.es5 ? e.varKinds.var : e.varKinds.const;
                    p = (0, r._)`${p}${$} ${_} = ${m};${this.opts._n}`;
                  } else if ((m = h?.(_)))
                    p = (0, r._)`${p}${m}${this.opts._n}`;
                  else throw new t(_);
                  y.set(_, n.Completed);
                });
              }
              return p;
            }
          }
          e.ValueScope = a;
        })(ei)),
      ei
    );
  }
  var ss;
  function te() {
    return (
      ss ||
        ((ss = 1),
        (function (e) {
          (Object.defineProperty(e, "__esModule", { value: !0 }),
            (e.or =
              e.and =
              e.not =
              e.CodeGen =
              e.operators =
              e.varKinds =
              e.ValueScopeName =
              e.ValueScope =
              e.Scope =
              e.Name =
              e.regexpCode =
              e.stringify =
              e.getProperty =
              e.nil =
              e.strConcat =
              e.str =
              e._ =
                void 0));
          const r = _t(),
            t = os();
          var n = _t();
          (Object.defineProperty(e, "_", {
            enumerable: !0,
            get: function () {
              return n._;
            },
          }),
            Object.defineProperty(e, "str", {
              enumerable: !0,
              get: function () {
                return n.str;
              },
            }),
            Object.defineProperty(e, "strConcat", {
              enumerable: !0,
              get: function () {
                return n.strConcat;
              },
            }),
            Object.defineProperty(e, "nil", {
              enumerable: !0,
              get: function () {
                return n.nil;
              },
            }),
            Object.defineProperty(e, "getProperty", {
              enumerable: !0,
              get: function () {
                return n.getProperty;
              },
            }),
            Object.defineProperty(e, "stringify", {
              enumerable: !0,
              get: function () {
                return n.stringify;
              },
            }),
            Object.defineProperty(e, "regexpCode", {
              enumerable: !0,
              get: function () {
                return n.regexpCode;
              },
            }),
            Object.defineProperty(e, "Name", {
              enumerable: !0,
              get: function () {
                return n.Name;
              },
            }));
          var i = os();
          (Object.defineProperty(e, "Scope", {
            enumerable: !0,
            get: function () {
              return i.Scope;
            },
          }),
            Object.defineProperty(e, "ValueScope", {
              enumerable: !0,
              get: function () {
                return i.ValueScope;
              },
            }),
            Object.defineProperty(e, "ValueScopeName", {
              enumerable: !0,
              get: function () {
                return i.ValueScopeName;
              },
            }),
            Object.defineProperty(e, "varKinds", {
              enumerable: !0,
              get: function () {
                return i.varKinds;
              },
            }),
            (e.operators = {
              GT: new r._Code(">"),
              GTE: new r._Code(">="),
              LT: new r._Code("<"),
              LTE: new r._Code("<="),
              EQ: new r._Code("==="),
              NEQ: new r._Code("!=="),
              NOT: new r._Code("!"),
              OR: new r._Code("||"),
              AND: new r._Code("&&"),
              ADD: new r._Code("+"),
            }));
          class o {
            optimizeNodes() {
              return this;
            }
            optimizeNames(S, R) {
              return this;
            }
          }
          class s extends o {
            constructor(S, R, M) {
              (super(), (this.varKind = S), (this.name = R), (this.rhs = M));
            }
            render({ es5: S, _n: R }) {
              const M = S ? t.varKinds.var : this.varKind,
                X = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
              return `${M} ${this.name}${X};` + R;
            }
            optimizeNames(S, R) {
              if (S[this.name.str])
                return (this.rhs && (this.rhs = J(this.rhs, S, R)), this);
            }
            get names() {
              return this.rhs instanceof r._CodeOrName ? this.rhs.names : {};
            }
          }
          class a extends o {
            constructor(S, R, M) {
              (super(), (this.lhs = S), (this.rhs = R), (this.sideEffects = M));
            }
            render({ _n: S }) {
              return `${this.lhs} = ${this.rhs};` + S;
            }
            optimizeNames(S, R) {
              if (
                !(
                  this.lhs instanceof r.Name &&
                  !S[this.lhs.str] &&
                  !this.sideEffects
                )
              )
                return ((this.rhs = J(this.rhs, S, R)), this);
            }
            get names() {
              const S = this.lhs instanceof r.Name ? {} : { ...this.lhs.names };
              return Y(S, this.rhs);
            }
          }
          class u extends a {
            constructor(S, R, M, X) {
              (super(S, M, X), (this.op = R));
            }
            render({ _n: S }) {
              return `${this.lhs} ${this.op}= ${this.rhs};` + S;
            }
          }
          class d extends o {
            constructor(S) {
              (super(), (this.label = S), (this.names = {}));
            }
            render({ _n: S }) {
              return `${this.label}:` + S;
            }
          }
          class c extends o {
            constructor(S) {
              (super(), (this.label = S), (this.names = {}));
            }
            render({ _n: S }) {
              return `break${this.label ? ` ${this.label}` : ""};` + S;
            }
          }
          class g extends o {
            constructor(S) {
              (super(), (this.error = S));
            }
            render({ _n: S }) {
              return `throw ${this.error};` + S;
            }
            get names() {
              return this.error.names;
            }
          }
          class h extends o {
            constructor(S) {
              (super(), (this.code = S));
            }
            render({ _n: S }) {
              return `${this.code};` + S;
            }
            optimizeNodes() {
              return `${this.code}` ? this : void 0;
            }
            optimizeNames(S, R) {
              return ((this.code = J(this.code, S, R)), this);
            }
            get names() {
              return this.code instanceof r._CodeOrName ? this.code.names : {};
            }
          }
          class p extends o {
            constructor(S = []) {
              (super(), (this.nodes = S));
            }
            render(S) {
              return this.nodes.reduce((R, M) => R + M.render(S), "");
            }
            optimizeNodes() {
              const { nodes: S } = this;
              let R = S.length;
              for (; R--; ) {
                const M = S[R].optimizeNodes();
                Array.isArray(M)
                  ? S.splice(R, 1, ...M)
                  : M
                    ? (S[R] = M)
                    : S.splice(R, 1);
              }
              return S.length > 0 ? this : void 0;
            }
            optimizeNames(S, R) {
              const { nodes: M } = this;
              let X = M.length;
              for (; X--; ) {
                const Z = M[X];
                Z.optimizeNames(S, R) || (le(S, Z.names), M.splice(X, 1));
              }
              return M.length > 0 ? this : void 0;
            }
            get names() {
              return this.nodes.reduce((S, R) => W(S, R.names), {});
            }
          }
          class v extends p {
            render(S) {
              return "{" + S._n + super.render(S) + "}" + S._n;
            }
          }
          class w extends p {}
          class y extends v {}
          y.kind = "else";
          class _ extends v {
            constructor(S, R) {
              (super(R), (this.condition = S));
            }
            render(S) {
              let R = `if(${this.condition})` + super.render(S);
              return (this.else && (R += "else " + this.else.render(S)), R);
            }
            optimizeNodes() {
              super.optimizeNodes();
              const S = this.condition;
              if (S === !0) return this.nodes;
              let R = this.else;
              if (R) {
                const M = R.optimizeNodes();
                R = this.else = Array.isArray(M) ? new y(M) : M;
              }
              if (R)
                return S === !1
                  ? R instanceof _
                    ? R
                    : R.nodes
                  : this.nodes.length
                    ? this
                    : new _(Ie(S), R instanceof _ ? [R] : R.nodes);
              if (!(S === !1 || !this.nodes.length)) return this;
            }
            optimizeNames(S, R) {
              var M;
              if (
                ((this.else =
                  (M = this.else) === null || M === void 0
                    ? void 0
                    : M.optimizeNames(S, R)),
                !!(super.optimizeNames(S, R) || this.else))
              )
                return ((this.condition = J(this.condition, S, R)), this);
            }
            get names() {
              const S = super.names;
              return (
                Y(S, this.condition),
                this.else && W(S, this.else.names),
                S
              );
            }
          }
          _.kind = "if";
          class m extends v {}
          m.kind = "for";
          class $ extends m {
            constructor(S) {
              (super(), (this.iteration = S));
            }
            render(S) {
              return `for(${this.iteration})` + super.render(S);
            }
            optimizeNames(S, R) {
              if (super.optimizeNames(S, R))
                return ((this.iteration = J(this.iteration, S, R)), this);
            }
            get names() {
              return W(super.names, this.iteration.names);
            }
          }
          class P extends m {
            constructor(S, R, M, X) {
              (super(),
                (this.varKind = S),
                (this.name = R),
                (this.from = M),
                (this.to = X));
            }
            render(S) {
              const R = S.es5 ? t.varKinds.var : this.varKind,
                { name: M, from: X, to: Z } = this;
              return `for(${R} ${M}=${X}; ${M}<${Z}; ${M}++)` + super.render(S);
            }
            get names() {
              const S = Y(super.names, this.from);
              return Y(S, this.to);
            }
          }
          class b extends m {
            constructor(S, R, M, X) {
              (super(),
                (this.loop = S),
                (this.varKind = R),
                (this.name = M),
                (this.iterable = X));
            }
            render(S) {
              return (
                `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` +
                super.render(S)
              );
            }
            optimizeNames(S, R) {
              if (super.optimizeNames(S, R))
                return ((this.iterable = J(this.iterable, S, R)), this);
            }
            get names() {
              return W(super.names, this.iterable.names);
            }
          }
          class A extends v {
            constructor(S, R, M) {
              (super(), (this.name = S), (this.args = R), (this.async = M));
            }
            render(S) {
              return (
                `${this.async ? "async " : ""}function ${this.name}(${this.args})` +
                super.render(S)
              );
            }
          }
          A.kind = "func";
          class O extends p {
            render(S) {
              return "return " + super.render(S);
            }
          }
          O.kind = "return";
          class F extends v {
            render(S) {
              let R = "try" + super.render(S);
              return (
                this.catch && (R += this.catch.render(S)),
                this.finally && (R += this.finally.render(S)),
                R
              );
            }
            optimizeNodes() {
              var S, R;
              return (
                super.optimizeNodes(),
                (S = this.catch) === null || S === void 0 || S.optimizeNodes(),
                (R = this.finally) === null ||
                  R === void 0 ||
                  R.optimizeNodes(),
                this
              );
            }
            optimizeNames(S, R) {
              var M, X;
              return (
                super.optimizeNames(S, R),
                (M = this.catch) === null ||
                  M === void 0 ||
                  M.optimizeNames(S, R),
                (X = this.finally) === null ||
                  X === void 0 ||
                  X.optimizeNames(S, R),
                this
              );
            }
            get names() {
              const S = super.names;
              return (
                this.catch && W(S, this.catch.names),
                this.finally && W(S, this.finally.names),
                S
              );
            }
          }
          class V extends v {
            constructor(S) {
              (super(), (this.error = S));
            }
            render(S) {
              return `catch(${this.error})` + super.render(S);
            }
          }
          V.kind = "catch";
          class G extends v {
            render(S) {
              return "finally" + super.render(S);
            }
          }
          G.kind = "finally";
          class L {
            constructor(S, R = {}) {
              ((this._values = {}),
                (this._blockStarts = []),
                (this._constants = {}),
                (this.opts = {
                  ...R,
                  _n: R.lines
                    ? `
`
                    : "",
                }),
                (this._extScope = S),
                (this._scope = new t.Scope({ parent: S })),
                (this._nodes = [new w()]));
            }
            toString() {
              return this._root.render(this.opts);
            }
            name(S) {
              return this._scope.name(S);
            }
            scopeName(S) {
              return this._extScope.name(S);
            }
            scopeValue(S, R) {
              const M = this._extScope.value(S, R);
              return (
                (
                  this._values[M.prefix] || (this._values[M.prefix] = new Set())
                ).add(M),
                M
              );
            }
            getScopeValue(S, R) {
              return this._extScope.getValue(S, R);
            }
            scopeRefs(S) {
              return this._extScope.scopeRefs(S, this._values);
            }
            scopeCode() {
              return this._extScope.scopeCode(this._values);
            }
            _def(S, R, M, X) {
              const Z = this._scope.toName(R);
              return (
                M !== void 0 && X && (this._constants[Z.str] = M),
                this._leafNode(new s(S, Z, M)),
                Z
              );
            }
            const(S, R, M) {
              return this._def(t.varKinds.const, S, R, M);
            }
            let(S, R, M) {
              return this._def(t.varKinds.let, S, R, M);
            }
            var(S, R, M) {
              return this._def(t.varKinds.var, S, R, M);
            }
            assign(S, R, M) {
              return this._leafNode(new a(S, R, M));
            }
            add(S, R) {
              return this._leafNode(new u(S, e.operators.ADD, R));
            }
            code(S) {
              return (
                typeof S == "function"
                  ? S()
                  : S !== r.nil && this._leafNode(new h(S)),
                this
              );
            }
            object(...S) {
              const R = ["{"];
              for (const [M, X] of S)
                (R.length > 1 && R.push(","),
                  R.push(M),
                  (M !== X || this.opts.es5) &&
                    (R.push(":"), (0, r.addCodeArg)(R, X)));
              return (R.push("}"), new r._Code(R));
            }
            if(S, R, M) {
              if ((this._blockNode(new _(S)), R && M))
                this.code(R).else().code(M).endIf();
              else if (R) this.code(R).endIf();
              else if (M)
                throw new Error('CodeGen: "else" body without "then" body');
              return this;
            }
            elseIf(S) {
              return this._elseNode(new _(S));
            }
            else() {
              return this._elseNode(new y());
            }
            endIf() {
              return this._endBlockNode(_, y);
            }
            _for(S, R) {
              return (this._blockNode(S), R && this.code(R).endFor(), this);
            }
            for(S, R) {
              return this._for(new $(S), R);
            }
            forRange(
              S,
              R,
              M,
              X,
              Z = this.opts.es5 ? t.varKinds.var : t.varKinds.let,
            ) {
              const ce = this._scope.toName(S);
              return this._for(new P(Z, ce, R, M), () => X(ce));
            }
            forOf(S, R, M, X = t.varKinds.const) {
              const Z = this._scope.toName(S);
              if (this.opts.es5) {
                const ce = R instanceof r.Name ? R : this.var("_arr", R);
                return this.forRange("_i", 0, (0, r._)`${ce}.length`, (se) => {
                  (this.var(Z, (0, r._)`${ce}[${se}]`), M(Z));
                });
              }
              return this._for(new b("of", X, Z, R), () => M(Z));
            }
            forIn(
              S,
              R,
              M,
              X = this.opts.es5 ? t.varKinds.var : t.varKinds.const,
            ) {
              if (this.opts.ownProperties)
                return this.forOf(S, (0, r._)`Object.keys(${R})`, M);
              const Z = this._scope.toName(S);
              return this._for(new b("in", X, Z, R), () => M(Z));
            }
            endFor() {
              return this._endBlockNode(m);
            }
            label(S) {
              return this._leafNode(new d(S));
            }
            break(S) {
              return this._leafNode(new c(S));
            }
            return(S) {
              const R = new O();
              if ((this._blockNode(R), this.code(S), R.nodes.length !== 1))
                throw new Error('CodeGen: "return" should have one node');
              return this._endBlockNode(O);
            }
            try(S, R, M) {
              if (!R && !M)
                throw new Error('CodeGen: "try" without "catch" and "finally"');
              const X = new F();
              if ((this._blockNode(X), this.code(S), R)) {
                const Z = this.name("e");
                ((this._currNode = X.catch = new V(Z)), R(Z));
              }
              return (
                M && ((this._currNode = X.finally = new G()), this.code(M)),
                this._endBlockNode(V, G)
              );
            }
            throw(S) {
              return this._leafNode(new g(S));
            }
            block(S, R) {
              return (
                this._blockStarts.push(this._nodes.length),
                S && this.code(S).endBlock(R),
                this
              );
            }
            endBlock(S) {
              const R = this._blockStarts.pop();
              if (R === void 0)
                throw new Error("CodeGen: not in self-balancing block");
              const M = this._nodes.length - R;
              if (M < 0 || (S !== void 0 && M !== S))
                throw new Error(
                  `CodeGen: wrong number of nodes: ${M} vs ${S} expected`,
                );
              return ((this._nodes.length = R), this);
            }
            func(S, R = r.nil, M, X) {
              return (
                this._blockNode(new A(S, R, M)),
                X && this.code(X).endFunc(),
                this
              );
            }
            endFunc() {
              return this._endBlockNode(A);
            }
            optimize(S = 1) {
              for (; S-- > 0; )
                (this._root.optimizeNodes(),
                  this._root.optimizeNames(this._root.names, this._constants));
            }
            _leafNode(S) {
              return (this._currNode.nodes.push(S), this);
            }
            _blockNode(S) {
              (this._currNode.nodes.push(S), this._nodes.push(S));
            }
            _endBlockNode(S, R) {
              const M = this._currNode;
              if (M instanceof S || (R && M instanceof R))
                return (this._nodes.pop(), this);
              throw new Error(
                `CodeGen: not in block "${R ? `${S.kind}/${R.kind}` : S.kind}"`,
              );
            }
            _elseNode(S) {
              const R = this._currNode;
              if (!(R instanceof _))
                throw new Error('CodeGen: "else" without "if"');
              return ((this._currNode = R.else = S), this);
            }
            get _root() {
              return this._nodes[0];
            }
            get _currNode() {
              const S = this._nodes;
              return S[S.length - 1];
            }
            set _currNode(S) {
              const R = this._nodes;
              R[R.length - 1] = S;
            }
          }
          e.CodeGen = L;
          function W(C, S) {
            for (const R in S) C[R] = (C[R] || 0) + (S[R] || 0);
            return C;
          }
          function Y(C, S) {
            return S instanceof r._CodeOrName ? W(C, S.names) : C;
          }
          function J(C, S, R) {
            if (C instanceof r.Name) return M(C);
            if (!X(C)) return C;
            return new r._Code(
              C._items.reduce(
                (Z, ce) => (
                  ce instanceof r.Name && (ce = M(ce)),
                  ce instanceof r._Code ? Z.push(...ce._items) : Z.push(ce),
                  Z
                ),
                [],
              ),
            );
            function M(Z) {
              const ce = R[Z.str];
              return ce === void 0 || S[Z.str] !== 1
                ? Z
                : (delete S[Z.str], ce);
            }
            function X(Z) {
              return (
                Z instanceof r._Code &&
                Z._items.some(
                  (ce) =>
                    ce instanceof r.Name &&
                    S[ce.str] === 1 &&
                    R[ce.str] !== void 0,
                )
              );
            }
          }
          function le(C, S) {
            for (const R in S) C[R] = (C[R] || 0) - (S[R] || 0);
          }
          function Ie(C) {
            return typeof C == "boolean" || typeof C == "number" || C === null
              ? !C
              : (0, r._)`!${U(C)}`;
          }
          e.not = Ie;
          const be = k(e.operators.AND);
          function ue(...C) {
            return C.reduce(be);
          }
          e.and = ue;
          const De = k(e.operators.OR);
          function z(...C) {
            return C.reduce(De);
          }
          e.or = z;
          function k(C) {
            return (S, R) =>
              S === r.nil
                ? R
                : R === r.nil
                  ? S
                  : (0, r._)`${U(S)} ${C} ${U(R)}`;
          }
          function U(C) {
            return C instanceof r.Name ? C : (0, r._)`(${C})`;
          }
        })(Qn)),
      Qn
    );
  }
  var ie = {},
    as;
  function oe() {
    if (as) return ie;
    ((as = 1),
      Object.defineProperty(ie, "__esModule", { value: !0 }),
      (ie.checkStrictMode =
        ie.getErrorPath =
        ie.Type =
        ie.useFunc =
        ie.setEvaluated =
        ie.evaluatedPropsToName =
        ie.mergeEvaluated =
        ie.eachItem =
        ie.unescapeJsonPointer =
        ie.escapeJsonPointer =
        ie.escapeFragment =
        ie.unescapeFragment =
        ie.schemaRefOrVal =
        ie.schemaHasRulesButRef =
        ie.schemaHasRules =
        ie.checkUnknownRules =
        ie.alwaysValidSchema =
        ie.toHash =
          void 0));
    const e = te(),
      r = _t();
    function t(b) {
      const A = {};
      for (const O of b) A[O] = !0;
      return A;
    }
    ie.toHash = t;
    function n(b, A) {
      return typeof A == "boolean"
        ? A
        : Object.keys(A).length === 0
          ? !0
          : (i(b, A), !o(A, b.self.RULES.all));
    }
    ie.alwaysValidSchema = n;
    function i(b, A = b.schema) {
      const { opts: O, self: F } = b;
      if (!O.strictSchema || typeof A == "boolean") return;
      const V = F.RULES.keywords;
      for (const G in A) V[G] || P(b, `unknown keyword: "${G}"`);
    }
    ie.checkUnknownRules = i;
    function o(b, A) {
      if (typeof b == "boolean") return !b;
      for (const O in b) if (A[O]) return !0;
      return !1;
    }
    ie.schemaHasRules = o;
    function s(b, A) {
      if (typeof b == "boolean") return !b;
      for (const O in b) if (O !== "$ref" && A.all[O]) return !0;
      return !1;
    }
    ie.schemaHasRulesButRef = s;
    function a({ topSchemaRef: b, schemaPath: A }, O, F, V) {
      if (!V) {
        if (typeof O == "number" || typeof O == "boolean") return O;
        if (typeof O == "string") return (0, e._)`${O}`;
      }
      return (0, e._)`${b}${A}${(0, e.getProperty)(F)}`;
    }
    ie.schemaRefOrVal = a;
    function u(b) {
      return g(decodeURIComponent(b));
    }
    ie.unescapeFragment = u;
    function d(b) {
      return encodeURIComponent(c(b));
    }
    ie.escapeFragment = d;
    function c(b) {
      return typeof b == "number"
        ? `${b}`
        : b.replace(/~/g, "~0").replace(/\//g, "~1");
    }
    ie.escapeJsonPointer = c;
    function g(b) {
      return b.replace(/~1/g, "/").replace(/~0/g, "~");
    }
    ie.unescapeJsonPointer = g;
    function h(b, A) {
      if (Array.isArray(b)) for (const O of b) A(O);
      else A(b);
    }
    ie.eachItem = h;
    function p({
      mergeNames: b,
      mergeToName: A,
      mergeValues: O,
      resultToName: F,
    }) {
      return (V, G, L, W) => {
        const Y =
          L === void 0
            ? G
            : L instanceof e.Name
              ? (G instanceof e.Name ? b(V, G, L) : A(V, G, L), L)
              : G instanceof e.Name
                ? (A(V, L, G), G)
                : O(G, L);
        return W === e.Name && !(Y instanceof e.Name) ? F(V, Y) : Y;
      };
    }
    ie.mergeEvaluated = {
      props: p({
        mergeNames: (b, A, O) =>
          b.if((0, e._)`${O} !== true && ${A} !== undefined`, () => {
            b.if(
              (0, e._)`${A} === true`,
              () => b.assign(O, !0),
              () =>
                b
                  .assign(O, (0, e._)`${O} || {}`)
                  .code((0, e._)`Object.assign(${O}, ${A})`),
            );
          }),
        mergeToName: (b, A, O) =>
          b.if((0, e._)`${O} !== true`, () => {
            A === !0
              ? b.assign(O, !0)
              : (b.assign(O, (0, e._)`${O} || {}`), w(b, O, A));
          }),
        mergeValues: (b, A) => (b === !0 ? !0 : { ...b, ...A }),
        resultToName: v,
      }),
      items: p({
        mergeNames: (b, A, O) =>
          b.if((0, e._)`${O} !== true && ${A} !== undefined`, () =>
            b.assign(
              O,
              (0, e._)`${A} === true ? true : ${O} > ${A} ? ${O} : ${A}`,
            ),
          ),
        mergeToName: (b, A, O) =>
          b.if((0, e._)`${O} !== true`, () =>
            b.assign(O, A === !0 ? !0 : (0, e._)`${O} > ${A} ? ${O} : ${A}`),
          ),
        mergeValues: (b, A) => (b === !0 ? !0 : Math.max(b, A)),
        resultToName: (b, A) => b.var("items", A),
      }),
    };
    function v(b, A) {
      if (A === !0) return b.var("props", !0);
      const O = b.var("props", (0, e._)`{}`);
      return (A !== void 0 && w(b, O, A), O);
    }
    ie.evaluatedPropsToName = v;
    function w(b, A, O) {
      Object.keys(O).forEach((F) =>
        b.assign((0, e._)`${A}${(0, e.getProperty)(F)}`, !0),
      );
    }
    ie.setEvaluated = w;
    const y = {};
    function _(b, A) {
      return b.scopeValue("func", {
        ref: A,
        code: y[A.code] || (y[A.code] = new r._Code(A.code)),
      });
    }
    ie.useFunc = _;
    var m;
    (function (b) {
      ((b[(b.Num = 0)] = "Num"), (b[(b.Str = 1)] = "Str"));
    })(m || (ie.Type = m = {}));
    function $(b, A, O) {
      if (b instanceof e.Name) {
        const F = A === m.Num;
        return O
          ? F
            ? (0, e._)`"[" + ${b} + "]"`
            : (0, e._)`"['" + ${b} + "']"`
          : F
            ? (0, e._)`"/" + ${b}`
            : (0, e._)`"/" + ${b}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
      }
      return O ? (0, e.getProperty)(b).toString() : "/" + c(b);
    }
    ie.getErrorPath = $;
    function P(b, A, O = b.opts.strictSchema) {
      if (O) {
        if (((A = `strict mode: ${A}`), O === !0)) throw new Error(A);
        b.self.logger.warn(A);
      }
    }
    return ((ie.checkStrictMode = P), ie);
  }
  var $t = {},
    cs;
  function Ve() {
    if (cs) return $t;
    ((cs = 1), Object.defineProperty($t, "__esModule", { value: !0 }));
    const e = te(),
      r = {
        data: new e.Name("data"),
        valCxt: new e.Name("valCxt"),
        instancePath: new e.Name("instancePath"),
        parentData: new e.Name("parentData"),
        parentDataProperty: new e.Name("parentDataProperty"),
        rootData: new e.Name("rootData"),
        dynamicAnchors: new e.Name("dynamicAnchors"),
        vErrors: new e.Name("vErrors"),
        errors: new e.Name("errors"),
        this: new e.Name("this"),
        self: new e.Name("self"),
        scope: new e.Name("scope"),
        json: new e.Name("json"),
        jsonPos: new e.Name("jsonPos"),
        jsonLen: new e.Name("jsonLen"),
        jsonPart: new e.Name("jsonPart"),
      };
    return (($t.default = r), $t);
  }
  var ls;
  function wt() {
    return (
      ls ||
        ((ls = 1),
        (function (e) {
          (Object.defineProperty(e, "__esModule", { value: !0 }),
            (e.extendErrors =
              e.resetErrorsCount =
              e.reportExtraError =
              e.reportError =
              e.keyword$DataError =
              e.keywordError =
                void 0));
          const r = te(),
            t = oe(),
            n = Ve();
          ((e.keywordError = {
            message: ({ keyword: y }) =>
              (0, r.str)`must pass "${y}" keyword validation`,
          }),
            (e.keyword$DataError = {
              message: ({ keyword: y, schemaType: _ }) =>
                _
                  ? (0, r.str)`"${y}" keyword must be ${_} ($data)`
                  : (0, r.str)`"${y}" keyword is invalid ($data)`,
            }));
          function i(y, _ = e.keywordError, m, $) {
            const { it: P } = y,
              { gen: b, compositeRule: A, allErrors: O } = P,
              F = g(y, _, m);
            ($ ?? (A || O)) ? u(b, F) : d(P, (0, r._)`[${F}]`);
          }
          e.reportError = i;
          function o(y, _ = e.keywordError, m) {
            const { it: $ } = y,
              { gen: P, compositeRule: b, allErrors: A } = $,
              O = g(y, _, m);
            (u(P, O), b || A || d($, n.default.vErrors));
          }
          e.reportExtraError = o;
          function s(y, _) {
            (y.assign(n.default.errors, _),
              y.if((0, r._)`${n.default.vErrors} !== null`, () =>
                y.if(
                  _,
                  () => y.assign((0, r._)`${n.default.vErrors}.length`, _),
                  () => y.assign(n.default.vErrors, null),
                ),
              ));
          }
          e.resetErrorsCount = s;
          function a({
            gen: y,
            keyword: _,
            schemaValue: m,
            data: $,
            errsCount: P,
            it: b,
          }) {
            if (P === void 0) throw new Error("ajv implementation error");
            const A = y.name("err");
            y.forRange("i", P, n.default.errors, (O) => {
              (y.const(A, (0, r._)`${n.default.vErrors}[${O}]`),
                y.if((0, r._)`${A}.instancePath === undefined`, () =>
                  y.assign(
                    (0, r._)`${A}.instancePath`,
                    (0, r.strConcat)(n.default.instancePath, b.errorPath),
                  ),
                ),
                y.assign(
                  (0, r._)`${A}.schemaPath`,
                  (0, r.str)`${b.errSchemaPath}/${_}`,
                ),
                b.opts.verbose &&
                  (y.assign((0, r._)`${A}.schema`, m),
                  y.assign((0, r._)`${A}.data`, $)));
            });
          }
          e.extendErrors = a;
          function u(y, _) {
            const m = y.const("err", _);
            (y.if(
              (0, r._)`${n.default.vErrors} === null`,
              () => y.assign(n.default.vErrors, (0, r._)`[${m}]`),
              (0, r._)`${n.default.vErrors}.push(${m})`,
            ),
              y.code((0, r._)`${n.default.errors}++`));
          }
          function d(y, _) {
            const { gen: m, validateName: $, schemaEnv: P } = y;
            P.$async
              ? m.throw((0, r._)`new ${y.ValidationError}(${_})`)
              : (m.assign((0, r._)`${$}.errors`, _), m.return(!1));
          }
          const c = {
            keyword: new r.Name("keyword"),
            schemaPath: new r.Name("schemaPath"),
            params: new r.Name("params"),
            propertyName: new r.Name("propertyName"),
            message: new r.Name("message"),
            schema: new r.Name("schema"),
            parentSchema: new r.Name("parentSchema"),
          };
          function g(y, _, m) {
            const { createErrors: $ } = y.it;
            return $ === !1 ? (0, r._)`{}` : h(y, _, m);
          }
          function h(y, _, m = {}) {
            const { gen: $, it: P } = y,
              b = [p(P, m), v(y, m)];
            return (w(y, _, b), $.object(...b));
          }
          function p({ errorPath: y }, { instancePath: _ }) {
            const m = _
              ? (0, r.str)`${y}${(0, t.getErrorPath)(_, t.Type.Str)}`
              : y;
            return [
              n.default.instancePath,
              (0, r.strConcat)(n.default.instancePath, m),
            ];
          }
          function v(
            { keyword: y, it: { errSchemaPath: _ } },
            { schemaPath: m, parentSchema: $ },
          ) {
            let P = $ ? _ : (0, r.str)`${_}/${y}`;
            return (
              m && (P = (0, r.str)`${P}${(0, t.getErrorPath)(m, t.Type.Str)}`),
              [c.schemaPath, P]
            );
          }
          function w(y, { params: _, message: m }, $) {
            const { keyword: P, data: b, schemaValue: A, it: O } = y,
              { opts: F, propertyName: V, topSchemaRef: G, schemaPath: L } = O;
            ($.push(
              [c.keyword, P],
              [c.params, typeof _ == "function" ? _(y) : _ || (0, r._)`{}`],
            ),
              F.messages &&
                $.push([c.message, typeof m == "function" ? m(y) : m]),
              F.verbose &&
                $.push(
                  [c.schema, A],
                  [c.parentSchema, (0, r._)`${G}${L}`],
                  [n.default.data, b],
                ),
              V && $.push([c.propertyName, V]));
          }
        })(Xn)),
      Xn
    );
  }
  var us;
  function Ef() {
    if (us) return Er;
    ((us = 1),
      Object.defineProperty(Er, "__esModule", { value: !0 }),
      (Er.boolOrEmptySchema = Er.topBoolOrEmptySchema = void 0));
    const e = wt(),
      r = te(),
      t = Ve(),
      n = { message: "boolean schema is false" };
    function i(a) {
      const { gen: u, schema: d, validateName: c } = a;
      d === !1
        ? s(a, !1)
        : typeof d == "object" && d.$async === !0
          ? u.return(t.default.data)
          : (u.assign((0, r._)`${c}.errors`, null), u.return(!0));
    }
    Er.topBoolOrEmptySchema = i;
    function o(a, u) {
      const { gen: d, schema: c } = a;
      c === !1 ? (d.var(u, !1), s(a)) : d.var(u, !0);
    }
    Er.boolOrEmptySchema = o;
    function s(a, u) {
      const { gen: d, data: c } = a,
        g = {
          gen: d,
          keyword: "false schema",
          data: c,
          schema: !1,
          schemaCode: !1,
          schemaValue: !1,
          params: {},
          it: a,
        };
      (0, e.reportError)(g, n, void 0, u);
    }
    return Er;
  }
  var Ae = {},
    Sr = {},
    fs;
  function ds() {
    if (fs) return Sr;
    ((fs = 1),
      Object.defineProperty(Sr, "__esModule", { value: !0 }),
      (Sr.getRules = Sr.isJSONType = void 0));
    const e = [
        "string",
        "number",
        "integer",
        "boolean",
        "null",
        "object",
        "array",
      ],
      r = new Set(e);
    function t(i) {
      return typeof i == "string" && r.has(i);
    }
    Sr.isJSONType = t;
    function n() {
      const i = {
        number: { type: "number", rules: [] },
        string: { type: "string", rules: [] },
        array: { type: "array", rules: [] },
        object: { type: "object", rules: [] },
      };
      return {
        types: { ...i, integer: !0, boolean: !0, null: !0 },
        rules: [{ rules: [] }, i.number, i.string, i.array, i.object],
        post: { rules: [] },
        all: {},
        keywords: {},
      };
    }
    return ((Sr.getRules = n), Sr);
  }
  var ar = {},
    ps;
  function hs() {
    if (ps) return ar;
    ((ps = 1),
      Object.defineProperty(ar, "__esModule", { value: !0 }),
      (ar.shouldUseRule =
        ar.shouldUseGroup =
        ar.schemaHasRulesForType =
          void 0));
    function e({ schema: n, self: i }, o) {
      const s = i.RULES.types[o];
      return s && s !== !0 && r(n, s);
    }
    ar.schemaHasRulesForType = e;
    function r(n, i) {
      return i.rules.some((o) => t(n, o));
    }
    ar.shouldUseGroup = r;
    function t(n, i) {
      var o;
      return (
        n[i.keyword] !== void 0 ||
        ((o = i.definition.implements) === null || o === void 0
          ? void 0
          : o.some((s) => n[s] !== void 0))
      );
    }
    return ((ar.shouldUseRule = t), ar);
  }
  var ms;
  function bt() {
    if (ms) return Ae;
    ((ms = 1),
      Object.defineProperty(Ae, "__esModule", { value: !0 }),
      (Ae.reportTypeError =
        Ae.checkDataTypes =
        Ae.checkDataType =
        Ae.coerceAndCheckDataType =
        Ae.getJSONTypes =
        Ae.getSchemaTypes =
        Ae.DataType =
          void 0));
    const e = ds(),
      r = hs(),
      t = wt(),
      n = te(),
      i = oe();
    var o;
    (function (m) {
      ((m[(m.Correct = 0)] = "Correct"), (m[(m.Wrong = 1)] = "Wrong"));
    })(o || (Ae.DataType = o = {}));
    function s(m) {
      const $ = a(m.type);
      if ($.includes("null")) {
        if (m.nullable === !1)
          throw new Error("type: null contradicts nullable: false");
      } else {
        if (!$.length && m.nullable !== void 0)
          throw new Error('"nullable" cannot be used without "type"');
        m.nullable === !0 && $.push("null");
      }
      return $;
    }
    Ae.getSchemaTypes = s;
    function a(m) {
      const $ = Array.isArray(m) ? m : m ? [m] : [];
      if ($.every(e.isJSONType)) return $;
      throw new Error("type must be JSONType or JSONType[]: " + $.join(","));
    }
    Ae.getJSONTypes = a;
    function u(m, $) {
      const { gen: P, data: b, opts: A } = m,
        O = c($, A.coerceTypes),
        F =
          $.length > 0 &&
          !(
            O.length === 0 &&
            $.length === 1 &&
            (0, r.schemaHasRulesForType)(m, $[0])
          );
      if (F) {
        const V = v($, b, A.strictNumbers, o.Wrong);
        P.if(V, () => {
          O.length ? g(m, $, O) : y(m);
        });
      }
      return F;
    }
    Ae.coerceAndCheckDataType = u;
    const d = new Set(["string", "number", "integer", "boolean", "null"]);
    function c(m, $) {
      return $
        ? m.filter((P) => d.has(P) || ($ === "array" && P === "array"))
        : [];
    }
    function g(m, $, P) {
      const { gen: b, data: A, opts: O } = m,
        F = b.let("dataType", (0, n._)`typeof ${A}`),
        V = b.let("coerced", (0, n._)`undefined`);
      (O.coerceTypes === "array" &&
        b.if(
          (0, n._)`${F} == 'object' && Array.isArray(${A}) && ${A}.length == 1`,
          () =>
            b
              .assign(A, (0, n._)`${A}[0]`)
              .assign(F, (0, n._)`typeof ${A}`)
              .if(v($, A, O.strictNumbers), () => b.assign(V, A)),
        ),
        b.if((0, n._)`${V} !== undefined`));
      for (const L of P)
        (d.has(L) || (L === "array" && O.coerceTypes === "array")) && G(L);
      (b.else(),
        y(m),
        b.endIf(),
        b.if((0, n._)`${V} !== undefined`, () => {
          (b.assign(A, V), h(m, V));
        }));
      function G(L) {
        switch (L) {
          case "string":
            b.elseIf((0, n._)`${F} == "number" || ${F} == "boolean"`)
              .assign(V, (0, n._)`"" + ${A}`)
              .elseIf((0, n._)`${A} === null`)
              .assign(V, (0, n._)`""`);
            return;
          case "number":
            b.elseIf(
              (0, n._)`${F} == "boolean" || ${A} === null
              || (${F} == "string" && ${A} && ${A} == +${A})`,
            ).assign(V, (0, n._)`+${A}`);
            return;
          case "integer":
            b.elseIf(
              (0, n._)`${F} === "boolean" || ${A} === null
              || (${F} === "string" && ${A} && ${A} == +${A} && !(${A} % 1))`,
            ).assign(V, (0, n._)`+${A}`);
            return;
          case "boolean":
            b.elseIf((0, n._)`${A} === "false" || ${A} === 0 || ${A} === null`)
              .assign(V, !1)
              .elseIf((0, n._)`${A} === "true" || ${A} === 1`)
              .assign(V, !0);
            return;
          case "null":
            (b.elseIf((0, n._)`${A} === "" || ${A} === 0 || ${A} === false`),
              b.assign(V, null));
            return;
          case "array":
            b.elseIf(
              (0, n._)`${F} === "string" || ${F} === "number"
              || ${F} === "boolean" || ${A} === null`,
            ).assign(V, (0, n._)`[${A}]`);
        }
      }
    }
    function h({ gen: m, parentData: $, parentDataProperty: P }, b) {
      m.if((0, n._)`${$} !== undefined`, () =>
        m.assign((0, n._)`${$}[${P}]`, b),
      );
    }
    function p(m, $, P, b = o.Correct) {
      const A = b === o.Correct ? n.operators.EQ : n.operators.NEQ;
      let O;
      switch (m) {
        case "null":
          return (0, n._)`${$} ${A} null`;
        case "array":
          O = (0, n._)`Array.isArray(${$})`;
          break;
        case "object":
          O = (0, n._)`${$} && typeof ${$} == "object" && !Array.isArray(${$})`;
          break;
        case "integer":
          O = F((0, n._)`!(${$} % 1) && !isNaN(${$})`);
          break;
        case "number":
          O = F();
          break;
        default:
          return (0, n._)`typeof ${$} ${A} ${m}`;
      }
      return b === o.Correct ? O : (0, n.not)(O);
      function F(V = n.nil) {
        return (0, n.and)(
          (0, n._)`typeof ${$} == "number"`,
          V,
          P ? (0, n._)`isFinite(${$})` : n.nil,
        );
      }
    }
    Ae.checkDataType = p;
    function v(m, $, P, b) {
      if (m.length === 1) return p(m[0], $, P, b);
      let A;
      const O = (0, i.toHash)(m);
      if (O.array && O.object) {
        const F = (0, n._)`typeof ${$} != "object"`;
        ((A = O.null ? F : (0, n._)`!${$} || ${F}`),
          delete O.null,
          delete O.array,
          delete O.object);
      } else A = n.nil;
      O.number && delete O.integer;
      for (const F in O) A = (0, n.and)(A, p(F, $, P, b));
      return A;
    }
    Ae.checkDataTypes = v;
    const w = {
      message: ({ schema: m }) => `must be ${m}`,
      params: ({ schema: m, schemaValue: $ }) =>
        typeof m == "string" ? (0, n._)`{type: ${m}}` : (0, n._)`{type: ${$}}`,
    };
    function y(m) {
      const $ = _(m);
      (0, t.reportError)($, w);
    }
    Ae.reportTypeError = y;
    function _(m) {
      const { gen: $, data: P, schema: b } = m,
        A = (0, i.schemaRefOrVal)(m, b, "type");
      return {
        gen: $,
        keyword: "type",
        data: P,
        schema: b.type,
        schemaCode: A,
        schemaValue: A,
        parentSchema: b,
        params: {},
        it: m,
      };
    }
    return Ae;
  }
  var Zr = {},
    ys;
  function Sf() {
    if (ys) return Zr;
    ((ys = 1),
      Object.defineProperty(Zr, "__esModule", { value: !0 }),
      (Zr.assignDefaults = void 0));
    const e = te(),
      r = oe();
    function t(i, o) {
      const { properties: s, items: a } = i.schema;
      if (o === "object" && s) for (const u in s) n(i, u, s[u].default);
      else
        o === "array" &&
          Array.isArray(a) &&
          a.forEach((u, d) => n(i, d, u.default));
    }
    Zr.assignDefaults = t;
    function n(i, o, s) {
      const { gen: a, compositeRule: u, data: d, opts: c } = i;
      if (s === void 0) return;
      const g = (0, e._)`${d}${(0, e.getProperty)(o)}`;
      if (u) {
        (0, r.checkStrictMode)(i, `default is ignored for: ${g}`);
        return;
      }
      let h = (0, e._)`${g} === undefined`;
      (c.useDefaults === "empty" &&
        (h = (0, e._)`${h} || ${g} === null || ${g} === ""`),
        a.if(h, (0, e._)`${g} = ${(0, e.stringify)(s)}`));
    }
    return Zr;
  }
  var ze = {},
    fe = {},
    gs;
  function Ke() {
    if (gs) return fe;
    ((gs = 1),
      Object.defineProperty(fe, "__esModule", { value: !0 }),
      (fe.validateUnion =
        fe.validateArray =
        fe.usePattern =
        fe.callValidateCode =
        fe.schemaProperties =
        fe.allSchemaProperties =
        fe.noPropertyInData =
        fe.propertyInData =
        fe.isOwnProperty =
        fe.hasPropFunc =
        fe.reportMissingProp =
        fe.checkMissingProp =
        fe.checkReportMissingProp =
          void 0));
    const e = te(),
      r = oe(),
      t = Ve(),
      n = oe();
    function i(m, $) {
      const { gen: P, data: b, it: A } = m;
      P.if(c(P, b, $, A.opts.ownProperties), () => {
        (m.setParams({ missingProperty: (0, e._)`${$}` }, !0), m.error());
      });
    }
    fe.checkReportMissingProp = i;
    function o({ gen: m, data: $, it: { opts: P } }, b, A) {
      return (0, e.or)(
        ...b.map((O) =>
          (0, e.and)(c(m, $, O, P.ownProperties), (0, e._)`${A} = ${O}`),
        ),
      );
    }
    fe.checkMissingProp = o;
    function s(m, $) {
      (m.setParams({ missingProperty: $ }, !0), m.error());
    }
    fe.reportMissingProp = s;
    function a(m) {
      return m.scopeValue("func", {
        ref: Object.prototype.hasOwnProperty,
        code: (0, e._)`Object.prototype.hasOwnProperty`,
      });
    }
    fe.hasPropFunc = a;
    function u(m, $, P) {
      return (0, e._)`${a(m)}.call(${$}, ${P})`;
    }
    fe.isOwnProperty = u;
    function d(m, $, P, b) {
      const A = (0, e._)`${$}${(0, e.getProperty)(P)} !== undefined`;
      return b ? (0, e._)`${A} && ${u(m, $, P)}` : A;
    }
    fe.propertyInData = d;
    function c(m, $, P, b) {
      const A = (0, e._)`${$}${(0, e.getProperty)(P)} === undefined`;
      return b ? (0, e.or)(A, (0, e.not)(u(m, $, P))) : A;
    }
    fe.noPropertyInData = c;
    function g(m) {
      return m ? Object.keys(m).filter(($) => $ !== "__proto__") : [];
    }
    fe.allSchemaProperties = g;
    function h(m, $) {
      return g($).filter((P) => !(0, r.alwaysValidSchema)(m, $[P]));
    }
    fe.schemaProperties = h;
    function p(
      {
        schemaCode: m,
        data: $,
        it: { gen: P, topSchemaRef: b, schemaPath: A, errorPath: O },
        it: F,
      },
      V,
      G,
      L,
    ) {
      const W = L ? (0, e._)`${m}, ${$}, ${b}${A}` : $,
        Y = [
          [t.default.instancePath, (0, e.strConcat)(t.default.instancePath, O)],
          [t.default.parentData, F.parentData],
          [t.default.parentDataProperty, F.parentDataProperty],
          [t.default.rootData, t.default.rootData],
        ];
      F.opts.dynamicRef &&
        Y.push([t.default.dynamicAnchors, t.default.dynamicAnchors]);
      const J = (0, e._)`${W}, ${P.object(...Y)}`;
      return G !== e.nil
        ? (0, e._)`${V}.call(${G}, ${J})`
        : (0, e._)`${V}(${J})`;
    }
    fe.callValidateCode = p;
    const v = (0, e._)`new RegExp`;
    function w({ gen: m, it: { opts: $ } }, P) {
      const b = $.unicodeRegExp ? "u" : "",
        { regExp: A } = $.code,
        O = A(P, b);
      return m.scopeValue("pattern", {
        key: O.toString(),
        ref: O,
        code: (0,
        e._)`${A.code === "new RegExp" ? v : (0, n.useFunc)(m, A)}(${P}, ${b})`,
      });
    }
    fe.usePattern = w;
    function y(m) {
      const { gen: $, data: P, keyword: b, it: A } = m,
        O = $.name("valid");
      if (A.allErrors) {
        const V = $.let("valid", !0);
        return (F(() => $.assign(V, !1)), V);
      }
      return ($.var(O, !0), F(() => $.break()), O);
      function F(V) {
        const G = $.const("len", (0, e._)`${P}.length`);
        $.forRange("i", 0, G, (L) => {
          (m.subschema(
            { keyword: b, dataProp: L, dataPropType: r.Type.Num },
            O,
          ),
            $.if((0, e.not)(O), V));
        });
      }
    }
    fe.validateArray = y;
    function _(m) {
      const { gen: $, schema: P, keyword: b, it: A } = m;
      if (!Array.isArray(P)) throw new Error("ajv implementation error");
      if (P.some((G) => (0, r.alwaysValidSchema)(A, G)) && !A.opts.unevaluated)
        return;
      const F = $.let("valid", !1),
        V = $.name("_valid");
      ($.block(() =>
        P.forEach((G, L) => {
          const W = m.subschema(
            { keyword: b, schemaProp: L, compositeRule: !0 },
            V,
          );
          ($.assign(F, (0, e._)`${F} || ${V}`),
            m.mergeValidEvaluated(W, V) || $.if((0, e.not)(F)));
        }),
      ),
        m.result(
          F,
          () => m.reset(),
          () => m.error(!0),
        ));
    }
    return ((fe.validateUnion = _), fe);
  }
  var vs;
  function Pf() {
    if (vs) return ze;
    ((vs = 1),
      Object.defineProperty(ze, "__esModule", { value: !0 }),
      (ze.validateKeywordUsage =
        ze.validSchemaType =
        ze.funcKeywordCode =
        ze.macroKeywordCode =
          void 0));
    const e = te(),
      r = Ve(),
      t = Ke(),
      n = wt();
    function i(h, p) {
      const { gen: v, keyword: w, schema: y, parentSchema: _, it: m } = h,
        $ = p.macro.call(m.self, y, _, m),
        P = d(v, w, $);
      m.opts.validateSchema !== !1 && m.self.validateSchema($, !0);
      const b = v.name("valid");
      (h.subschema(
        {
          schema: $,
          schemaPath: e.nil,
          errSchemaPath: `${m.errSchemaPath}/${w}`,
          topSchemaRef: P,
          compositeRule: !0,
        },
        b,
      ),
        h.pass(b, () => h.error(!0)));
    }
    ze.macroKeywordCode = i;
    function o(h, p) {
      var v;
      const {
        gen: w,
        keyword: y,
        schema: _,
        parentSchema: m,
        $data: $,
        it: P,
      } = h;
      u(P, p);
      const b = !$ && p.compile ? p.compile.call(P.self, _, m, P) : p.validate,
        A = d(w, y, b),
        O = w.let("valid");
      (h.block$data(O, F),
        h.ok((v = p.valid) !== null && v !== void 0 ? v : O));
      function F() {
        if (p.errors === !1) (L(), p.modifying && s(h), W(() => h.error()));
        else {
          const Y = p.async ? V() : G();
          (p.modifying && s(h), W(() => a(h, Y)));
        }
      }
      function V() {
        const Y = w.let("ruleErrs", null);
        return (
          w.try(
            () => L((0, e._)`await `),
            (J) =>
              w.assign(O, !1).if(
                (0, e._)`${J} instanceof ${P.ValidationError}`,
                () => w.assign(Y, (0, e._)`${J}.errors`),
                () => w.throw(J),
              ),
          ),
          Y
        );
      }
      function G() {
        const Y = (0, e._)`${A}.errors`;
        return (w.assign(Y, null), L(e.nil), Y);
      }
      function L(Y = p.async ? (0, e._)`await ` : e.nil) {
        const J = P.opts.passContext ? r.default.this : r.default.self,
          le = !(("compile" in p && !$) || p.schema === !1);
        w.assign(
          O,
          (0, e._)`${Y}${(0, t.callValidateCode)(h, A, J, le)}`,
          p.modifying,
        );
      }
      function W(Y) {
        var J;
        w.if((0, e.not)((J = p.valid) !== null && J !== void 0 ? J : O), Y);
      }
    }
    ze.funcKeywordCode = o;
    function s(h) {
      const { gen: p, data: v, it: w } = h;
      p.if(w.parentData, () =>
        p.assign(v, (0, e._)`${w.parentData}[${w.parentDataProperty}]`),
      );
    }
    function a(h, p) {
      const { gen: v } = h;
      v.if(
        (0, e._)`Array.isArray(${p})`,
        () => {
          (v
            .assign(
              r.default.vErrors,
              (0,
              e._)`${r.default.vErrors} === null ? ${p} : ${r.default.vErrors}.concat(${p})`,
            )
            .assign(r.default.errors, (0, e._)`${r.default.vErrors}.length`),
            (0, n.extendErrors)(h));
        },
        () => h.error(),
      );
    }
    function u({ schemaEnv: h }, p) {
      if (p.async && !h.$async) throw new Error("async keyword in sync schema");
    }
    function d(h, p, v) {
      if (v === void 0) throw new Error(`keyword "${p}" failed to compile`);
      return h.scopeValue(
        "keyword",
        typeof v == "function"
          ? { ref: v }
          : { ref: v, code: (0, e.stringify)(v) },
      );
    }
    function c(h, p, v = !1) {
      return (
        !p.length ||
        p.some((w) =>
          w === "array"
            ? Array.isArray(h)
            : w === "object"
              ? h && typeof h == "object" && !Array.isArray(h)
              : typeof h == w || (v && typeof h > "u"),
        )
      );
    }
    ze.validSchemaType = c;
    function g({ schema: h, opts: p, self: v, errSchemaPath: w }, y, _) {
      if (Array.isArray(y.keyword) ? !y.keyword.includes(_) : y.keyword !== _)
        throw new Error("ajv implementation error");
      const m = y.dependencies;
      if (m?.some(($) => !Object.prototype.hasOwnProperty.call(h, $)))
        throw new Error(
          `parent schema must have dependencies of ${_}: ${m.join(",")}`,
        );
      if (y.validateSchema && !y.validateSchema(h[_])) {
        const P =
          `keyword "${_}" value is invalid at path "${w}": ` +
          v.errorsText(y.validateSchema.errors);
        if (p.validateSchema === "log") v.logger.error(P);
        else throw new Error(P);
      }
    }
    return ((ze.validateKeywordUsage = g), ze);
  }
  var cr = {},
    _s;
  function Af() {
    if (_s) return cr;
    ((_s = 1),
      Object.defineProperty(cr, "__esModule", { value: !0 }),
      (cr.extendSubschemaMode =
        cr.extendSubschemaData =
        cr.getSubschema =
          void 0));
    const e = te(),
      r = oe();
    function t(
      o,
      {
        keyword: s,
        schemaProp: a,
        schema: u,
        schemaPath: d,
        errSchemaPath: c,
        topSchemaRef: g,
      },
    ) {
      if (s !== void 0 && u !== void 0)
        throw new Error('both "keyword" and "schema" passed, only one allowed');
      if (s !== void 0) {
        const h = o.schema[s];
        return a === void 0
          ? {
              schema: h,
              schemaPath: (0, e._)`${o.schemaPath}${(0, e.getProperty)(s)}`,
              errSchemaPath: `${o.errSchemaPath}/${s}`,
            }
          : {
              schema: h[a],
              schemaPath: (0,
              e._)`${o.schemaPath}${(0, e.getProperty)(s)}${(0, e.getProperty)(a)}`,
              errSchemaPath: `${o.errSchemaPath}/${s}/${(0, r.escapeFragment)(a)}`,
            };
      }
      if (u !== void 0) {
        if (d === void 0 || c === void 0 || g === void 0)
          throw new Error(
            '"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"',
          );
        return { schema: u, schemaPath: d, topSchemaRef: g, errSchemaPath: c };
      }
      throw new Error('either "keyword" or "schema" must be passed');
    }
    cr.getSubschema = t;
    function n(
      o,
      s,
      { dataProp: a, dataPropType: u, data: d, dataTypes: c, propertyName: g },
    ) {
      if (d !== void 0 && a !== void 0)
        throw new Error('both "data" and "dataProp" passed, only one allowed');
      const { gen: h } = s;
      if (a !== void 0) {
        const { errorPath: v, dataPathArr: w, opts: y } = s,
          _ = h.let("data", (0, e._)`${s.data}${(0, e.getProperty)(a)}`, !0);
        (p(_),
          (o.errorPath = (0,
          e.str)`${v}${(0, r.getErrorPath)(a, u, y.jsPropertySyntax)}`),
          (o.parentDataProperty = (0, e._)`${a}`),
          (o.dataPathArr = [...w, o.parentDataProperty]));
      }
      if (d !== void 0) {
        const v = d instanceof e.Name ? d : h.let("data", d, !0);
        (p(v), g !== void 0 && (o.propertyName = g));
      }
      c && (o.dataTypes = c);
      function p(v) {
        ((o.data = v),
          (o.dataLevel = s.dataLevel + 1),
          (o.dataTypes = []),
          (s.definedProperties = new Set()),
          (o.parentData = s.data),
          (o.dataNames = [...s.dataNames, v]));
      }
    }
    cr.extendSubschemaData = n;
    function i(
      o,
      {
        jtdDiscriminator: s,
        jtdMetadata: a,
        compositeRule: u,
        createErrors: d,
        allErrors: c,
      },
    ) {
      (u !== void 0 && (o.compositeRule = u),
        d !== void 0 && (o.createErrors = d),
        c !== void 0 && (o.allErrors = c),
        (o.jtdDiscriminator = s),
        (o.jtdMetadata = a));
    }
    return ((cr.extendSubschemaMode = i), cr);
  }
  var ke = {},
    ri,
    $s;
  function ws() {
    return (
      $s ||
        (($s = 1),
        (ri = function e(r, t) {
          if (r === t) return !0;
          if (r && t && typeof r == "object" && typeof t == "object") {
            if (r.constructor !== t.constructor) return !1;
            var n, i, o;
            if (Array.isArray(r)) {
              if (((n = r.length), n != t.length)) return !1;
              for (i = n; i-- !== 0; ) if (!e(r[i], t[i])) return !1;
              return !0;
            }
            if (r.constructor === RegExp)
              return r.source === t.source && r.flags === t.flags;
            if (r.valueOf !== Object.prototype.valueOf)
              return r.valueOf() === t.valueOf();
            if (r.toString !== Object.prototype.toString)
              return r.toString() === t.toString();
            if (
              ((o = Object.keys(r)),
              (n = o.length),
              n !== Object.keys(t).length)
            )
              return !1;
            for (i = n; i-- !== 0; )
              if (!Object.prototype.hasOwnProperty.call(t, o[i])) return !1;
            for (i = n; i-- !== 0; ) {
              var s = o[i];
              if (!e(r[s], t[s])) return !1;
            }
            return !0;
          }
          return r !== r && t !== t;
        })),
      ri
    );
  }
  var ti = { exports: {} },
    bs;
  function If() {
    if (bs) return ti.exports;
    bs = 1;
    var e = (ti.exports = function (n, i, o) {
      (typeof i == "function" && ((o = i), (i = {})), (o = i.cb || o));
      var s = typeof o == "function" ? o : o.pre || function () {},
        a = o.post || function () {};
      r(i, s, a, n, "", n);
    });
    ((e.keywords = {
      additionalItems: !0,
      items: !0,
      contains: !0,
      additionalProperties: !0,
      propertyNames: !0,
      not: !0,
      if: !0,
      then: !0,
      else: !0,
    }),
      (e.arrayKeywords = { items: !0, allOf: !0, anyOf: !0, oneOf: !0 }),
      (e.propsKeywords = {
        $defs: !0,
        definitions: !0,
        properties: !0,
        patternProperties: !0,
        dependencies: !0,
      }),
      (e.skipKeywords = {
        default: !0,
        enum: !0,
        const: !0,
        required: !0,
        maximum: !0,
        minimum: !0,
        exclusiveMaximum: !0,
        exclusiveMinimum: !0,
        multipleOf: !0,
        maxLength: !0,
        minLength: !0,
        pattern: !0,
        format: !0,
        maxItems: !0,
        minItems: !0,
        uniqueItems: !0,
        maxProperties: !0,
        minProperties: !0,
      }));
    function r(n, i, o, s, a, u, d, c, g, h) {
      if (s && typeof s == "object" && !Array.isArray(s)) {
        i(s, a, u, d, c, g, h);
        for (var p in s) {
          var v = s[p];
          if (Array.isArray(v)) {
            if (p in e.arrayKeywords)
              for (var w = 0; w < v.length; w++)
                r(n, i, o, v[w], a + "/" + p + "/" + w, u, a, p, s, w);
          } else if (p in e.propsKeywords) {
            if (v && typeof v == "object")
              for (var y in v)
                r(n, i, o, v[y], a + "/" + p + "/" + t(y), u, a, p, s, y);
          } else
            (p in e.keywords || (n.allKeys && !(p in e.skipKeywords))) &&
              r(n, i, o, v, a + "/" + p, u, a, p, s);
        }
        o(s, a, u, d, c, g, h);
      }
    }
    function t(n) {
      return n.replace(/~/g, "~0").replace(/\//g, "~1");
    }
    return ti.exports;
  }
  var Es;
  function Et() {
    if (Es) return ke;
    ((Es = 1),
      Object.defineProperty(ke, "__esModule", { value: !0 }),
      (ke.getSchemaRefs =
        ke.resolveUrl =
        ke.normalizeId =
        ke._getFullPath =
        ke.getFullPath =
        ke.inlineRef =
          void 0));
    const e = oe(),
      r = ws(),
      t = If(),
      n = new Set([
        "type",
        "format",
        "pattern",
        "maxLength",
        "minLength",
        "maxProperties",
        "minProperties",
        "maxItems",
        "minItems",
        "maximum",
        "minimum",
        "uniqueItems",
        "multipleOf",
        "required",
        "enum",
        "const",
      ]);
    function i(w, y = !0) {
      return typeof w == "boolean" ? !0 : y === !0 ? !s(w) : y ? a(w) <= y : !1;
    }
    ke.inlineRef = i;
    const o = new Set([
      "$ref",
      "$recursiveRef",
      "$recursiveAnchor",
      "$dynamicRef",
      "$dynamicAnchor",
    ]);
    function s(w) {
      for (const y in w) {
        if (o.has(y)) return !0;
        const _ = w[y];
        if ((Array.isArray(_) && _.some(s)) || (typeof _ == "object" && s(_)))
          return !0;
      }
      return !1;
    }
    function a(w) {
      let y = 0;
      for (const _ in w) {
        if (_ === "$ref") return 1 / 0;
        if (
          (y++,
          !n.has(_) &&
            (typeof w[_] == "object" &&
              (0, e.eachItem)(w[_], (m) => (y += a(m))),
            y === 1 / 0))
        )
          return 1 / 0;
      }
      return y;
    }
    function u(w, y = "", _) {
      _ !== !1 && (y = g(y));
      const m = w.parse(y);
      return d(w, m);
    }
    ke.getFullPath = u;
    function d(w, y) {
      return w.serialize(y).split("#")[0] + "#";
    }
    ke._getFullPath = d;
    const c = /#\/?$/;
    function g(w) {
      return w ? w.replace(c, "") : "";
    }
    ke.normalizeId = g;
    function h(w, y, _) {
      return ((_ = g(_)), w.resolve(y, _));
    }
    ke.resolveUrl = h;
    const p = /^[a-z_][-a-z0-9._]*$/i;
    function v(w, y) {
      if (typeof w == "boolean") return {};
      const { schemaId: _, uriResolver: m } = this.opts,
        $ = g(w[_] || y),
        P = { "": $ },
        b = u(m, $, !1),
        A = {},
        O = new Set();
      return (
        t(w, { allKeys: !0 }, (G, L, W, Y) => {
          if (Y === void 0) return;
          const J = b + L;
          let le = P[Y];
          (typeof G[_] == "string" && (le = Ie.call(this, G[_])),
            be.call(this, G.$anchor),
            be.call(this, G.$dynamicAnchor),
            (P[L] = le));
          function Ie(ue) {
            const De = this.opts.uriResolver.resolve;
            if (((ue = g(le ? De(le, ue) : ue)), O.has(ue))) throw V(ue);
            O.add(ue);
            let z = this.refs[ue];
            return (
              typeof z == "string" && (z = this.refs[z]),
              typeof z == "object"
                ? F(G, z.schema, ue)
                : ue !== g(J) &&
                  (ue[0] === "#"
                    ? (F(G, A[ue], ue), (A[ue] = G))
                    : (this.refs[ue] = J)),
              ue
            );
          }
          function be(ue) {
            if (typeof ue == "string") {
              if (!p.test(ue)) throw new Error(`invalid anchor "${ue}"`);
              Ie.call(this, `#${ue}`);
            }
          }
        }),
        A
      );
      function F(G, L, W) {
        if (L !== void 0 && !r(G, L)) throw V(W);
      }
      function V(G) {
        return new Error(`reference "${G}" resolves to more than one schema`);
      }
    }
    return ((ke.getSchemaRefs = v), ke);
  }
  var Ss;
  function St() {
    if (Ss) return sr;
    ((Ss = 1),
      Object.defineProperty(sr, "__esModule", { value: !0 }),
      (sr.getData = sr.KeywordCxt = sr.validateFunctionCode = void 0));
    const e = Ef(),
      r = bt(),
      t = hs(),
      n = bt(),
      i = Sf(),
      o = Pf(),
      s = Af(),
      a = te(),
      u = Ve(),
      d = Et(),
      c = oe(),
      g = wt();
    function h(x) {
      if (b(x) && (O(x), P(x))) {
        y(x);
        return;
      }
      p(x, () => (0, e.topBoolOrEmptySchema)(x));
    }
    sr.validateFunctionCode = h;
    function p(
      { gen: x, validateName: T, schema: B, schemaEnv: H, opts: Q },
      re,
    ) {
      Q.code.es5
        ? x.func(
            T,
            (0, a._)`${u.default.data}, ${u.default.valCxt}`,
            H.$async,
            () => {
              (x.code((0, a._)`"use strict"; ${m(B, Q)}`), w(x, Q), x.code(re));
            },
          )
        : x.func(T, (0, a._)`${u.default.data}, ${v(Q)}`, H.$async, () =>
            x.code(m(B, Q)).code(re),
          );
    }
    function v(x) {
      return (0,
      a._)`{${u.default.instancePath}="", ${u.default.parentData}, ${u.default.parentDataProperty}, ${u.default.rootData}=${u.default.data}${x.dynamicRef ? (0, a._)`, ${u.default.dynamicAnchors}={}` : a.nil}}={}`;
    }
    function w(x, T) {
      x.if(
        u.default.valCxt,
        () => {
          (x.var(
            u.default.instancePath,
            (0, a._)`${u.default.valCxt}.${u.default.instancePath}`,
          ),
            x.var(
              u.default.parentData,
              (0, a._)`${u.default.valCxt}.${u.default.parentData}`,
            ),
            x.var(
              u.default.parentDataProperty,
              (0, a._)`${u.default.valCxt}.${u.default.parentDataProperty}`,
            ),
            x.var(
              u.default.rootData,
              (0, a._)`${u.default.valCxt}.${u.default.rootData}`,
            ),
            T.dynamicRef &&
              x.var(
                u.default.dynamicAnchors,
                (0, a._)`${u.default.valCxt}.${u.default.dynamicAnchors}`,
              ));
        },
        () => {
          (x.var(u.default.instancePath, (0, a._)`""`),
            x.var(u.default.parentData, (0, a._)`undefined`),
            x.var(u.default.parentDataProperty, (0, a._)`undefined`),
            x.var(u.default.rootData, u.default.data),
            T.dynamicRef && x.var(u.default.dynamicAnchors, (0, a._)`{}`));
        },
      );
    }
    function y(x) {
      const { schema: T, opts: B, gen: H } = x;
      p(x, () => {
        (B.$comment && T.$comment && Y(x),
          G(x),
          H.let(u.default.vErrors, null),
          H.let(u.default.errors, 0),
          B.unevaluated && _(x),
          F(x),
          J(x));
      });
    }
    function _(x) {
      const { gen: T, validateName: B } = x;
      ((x.evaluated = T.const("evaluated", (0, a._)`${B}.evaluated`)),
        T.if((0, a._)`${x.evaluated}.dynamicProps`, () =>
          T.assign((0, a._)`${x.evaluated}.props`, (0, a._)`undefined`),
        ),
        T.if((0, a._)`${x.evaluated}.dynamicItems`, () =>
          T.assign((0, a._)`${x.evaluated}.items`, (0, a._)`undefined`),
        ));
    }
    function m(x, T) {
      const B = typeof x == "object" && x[T.schemaId];
      return B && (T.code.source || T.code.process)
        ? (0, a._)`/*# sourceURL=${B} */`
        : a.nil;
    }
    function $(x, T) {
      if (b(x) && (O(x), P(x))) {
        A(x, T);
        return;
      }
      (0, e.boolOrEmptySchema)(x, T);
    }
    function P({ schema: x, self: T }) {
      if (typeof x == "boolean") return !x;
      for (const B in x) if (T.RULES.all[B]) return !0;
      return !1;
    }
    function b(x) {
      return typeof x.schema != "boolean";
    }
    function A(x, T) {
      const { schema: B, gen: H, opts: Q } = x;
      (Q.$comment && B.$comment && Y(x), L(x), W(x));
      const re = H.const("_errs", u.default.errors);
      (F(x, re), H.var(T, (0, a._)`${re} === ${u.default.errors}`));
    }
    function O(x) {
      ((0, c.checkUnknownRules)(x), V(x));
    }
    function F(x, T) {
      if (x.opts.jtd) return Ie(x, [], !1, T);
      const B = (0, r.getSchemaTypes)(x.schema),
        H = (0, r.coerceAndCheckDataType)(x, B);
      Ie(x, B, !H, T);
    }
    function V(x) {
      const { schema: T, errSchemaPath: B, opts: H, self: Q } = x;
      T.$ref &&
        H.ignoreKeywordsWithRef &&
        (0, c.schemaHasRulesButRef)(T, Q.RULES) &&
        Q.logger.warn(`$ref: keywords ignored in schema at path "${B}"`);
    }
    function G(x) {
      const { schema: T, opts: B } = x;
      T.default !== void 0 &&
        B.useDefaults &&
        B.strictSchema &&
        (0, c.checkStrictMode)(x, "default is ignored in the schema root");
    }
    function L(x) {
      const T = x.schema[x.opts.schemaId];
      T && (x.baseId = (0, d.resolveUrl)(x.opts.uriResolver, x.baseId, T));
    }
    function W(x) {
      if (x.schema.$async && !x.schemaEnv.$async)
        throw new Error("async schema in sync schema");
    }
    function Y({ gen: x, schemaEnv: T, schema: B, errSchemaPath: H, opts: Q }) {
      const re = B.$comment;
      if (Q.$comment === !0)
        x.code((0, a._)`${u.default.self}.logger.log(${re})`);
      else if (typeof Q.$comment == "function") {
        const me = (0, a.str)`${H}/$comment`,
          Me = x.scopeValue("root", { ref: T.root });
        x.code(
          (0, a._)`${u.default.self}.opts.$comment(${re}, ${me}, ${Me}.schema)`,
        );
      }
    }
    function J(x) {
      const {
        gen: T,
        schemaEnv: B,
        validateName: H,
        ValidationError: Q,
        opts: re,
      } = x;
      B.$async
        ? T.if(
            (0, a._)`${u.default.errors} === 0`,
            () => T.return(u.default.data),
            () => T.throw((0, a._)`new ${Q}(${u.default.vErrors})`),
          )
        : (T.assign((0, a._)`${H}.errors`, u.default.vErrors),
          re.unevaluated && le(x),
          T.return((0, a._)`${u.default.errors} === 0`));
    }
    function le({ gen: x, evaluated: T, props: B, items: H }) {
      (B instanceof a.Name && x.assign((0, a._)`${T}.props`, B),
        H instanceof a.Name && x.assign((0, a._)`${T}.items`, H));
    }
    function Ie(x, T, B, H) {
      const {
          gen: Q,
          schema: re,
          data: me,
          allErrors: Me,
          opts: Ne,
          self: Ee,
        } = x,
        { RULES: we } = Ee;
      if (
        re.$ref &&
        (Ne.ignoreKeywordsWithRef || !(0, c.schemaHasRulesButRef)(re, we))
      ) {
        Q.block(() => X(x, "$ref", we.all.$ref.definition));
        return;
      }
      (Ne.jtd || ue(x, T),
        Q.block(() => {
          for (const Te of we.rules) vr(Te);
          vr(we.post);
        }));
      function vr(Te) {
        (0, t.shouldUseGroup)(re, Te) &&
          (Te.type
            ? (Q.if((0, n.checkDataType)(Te.type, me, Ne.strictNumbers)),
              be(x, Te),
              T.length === 1 &&
                T[0] === Te.type &&
                B &&
                (Q.else(), (0, n.reportTypeError)(x)),
              Q.endIf())
            : be(x, Te),
          Me || Q.if((0, a._)`${u.default.errors} === ${H || 0}`));
      }
    }
    function be(x, T) {
      const {
        gen: B,
        schema: H,
        opts: { useDefaults: Q },
      } = x;
      (Q && (0, i.assignDefaults)(x, T.type),
        B.block(() => {
          for (const re of T.rules)
            (0, t.shouldUseRule)(H, re) &&
              X(x, re.keyword, re.definition, T.type);
        }));
    }
    function ue(x, T) {
      x.schemaEnv.meta ||
        !x.opts.strictTypes ||
        (De(x, T), x.opts.allowUnionTypes || z(x, T), k(x, x.dataTypes));
    }
    function De(x, T) {
      if (T.length) {
        if (!x.dataTypes.length) {
          x.dataTypes = T;
          return;
        }
        (T.forEach((B) => {
          C(x.dataTypes, B) ||
            R(
              x,
              `type "${B}" not allowed by context "${x.dataTypes.join(",")}"`,
            );
        }),
          S(x, T));
      }
    }
    function z(x, T) {
      T.length > 1 &&
        !(T.length === 2 && T.includes("null")) &&
        R(x, "use allowUnionTypes to allow union type keyword");
    }
    function k(x, T) {
      const B = x.self.RULES.all;
      for (const H in B) {
        const Q = B[H];
        if (typeof Q == "object" && (0, t.shouldUseRule)(x.schema, Q)) {
          const { type: re } = Q.definition;
          re.length &&
            !re.some((me) => U(T, me)) &&
            R(x, `missing type "${re.join(",")}" for keyword "${H}"`);
        }
      }
    }
    function U(x, T) {
      return x.includes(T) || (T === "number" && x.includes("integer"));
    }
    function C(x, T) {
      return x.includes(T) || (T === "integer" && x.includes("number"));
    }
    function S(x, T) {
      const B = [];
      for (const H of x.dataTypes)
        C(T, H)
          ? B.push(H)
          : T.includes("integer") && H === "number" && B.push("integer");
      x.dataTypes = B;
    }
    function R(x, T) {
      const B = x.schemaEnv.baseId + x.errSchemaPath;
      ((T += ` at "${B}" (strictTypes)`),
        (0, c.checkStrictMode)(x, T, x.opts.strictTypes));
    }
    class M {
      constructor(T, B, H) {
        if (
          ((0, o.validateKeywordUsage)(T, B, H),
          (this.gen = T.gen),
          (this.allErrors = T.allErrors),
          (this.keyword = H),
          (this.data = T.data),
          (this.schema = T.schema[H]),
          (this.$data =
            B.$data && T.opts.$data && this.schema && this.schema.$data),
          (this.schemaValue = (0, c.schemaRefOrVal)(
            T,
            this.schema,
            H,
            this.$data,
          )),
          (this.schemaType = B.schemaType),
          (this.parentSchema = T.schema),
          (this.params = {}),
          (this.it = T),
          (this.def = B),
          this.$data)
        )
          this.schemaCode = T.gen.const("vSchema", se(this.$data, T));
        else if (
          ((this.schemaCode = this.schemaValue),
          !(0, o.validSchemaType)(this.schema, B.schemaType, B.allowUndefined))
        )
          throw new Error(`${H} value must be ${JSON.stringify(B.schemaType)}`);
        ("code" in B ? B.trackErrors : B.errors !== !1) &&
          (this.errsCount = T.gen.const("_errs", u.default.errors));
      }
      result(T, B, H) {
        this.failResult((0, a.not)(T), B, H);
      }
      failResult(T, B, H) {
        (this.gen.if(T),
          H ? H() : this.error(),
          B
            ? (this.gen.else(), B(), this.allErrors && this.gen.endIf())
            : this.allErrors
              ? this.gen.endIf()
              : this.gen.else());
      }
      pass(T, B) {
        this.failResult((0, a.not)(T), void 0, B);
      }
      fail(T) {
        if (T === void 0) {
          (this.error(), this.allErrors || this.gen.if(!1));
          return;
        }
        (this.gen.if(T),
          this.error(),
          this.allErrors ? this.gen.endIf() : this.gen.else());
      }
      fail$data(T) {
        if (!this.$data) return this.fail(T);
        const { schemaCode: B } = this;
        this.fail(
          (0,
          a._)`${B} !== undefined && (${(0, a.or)(this.invalid$data(), T)})`,
        );
      }
      error(T, B, H) {
        if (B) {
          (this.setParams(B), this._error(T, H), this.setParams({}));
          return;
        }
        this._error(T, H);
      }
      _error(T, B) {
        (T ? g.reportExtraError : g.reportError)(this, this.def.error, B);
      }
      $dataError() {
        (0, g.reportError)(this, this.def.$dataError || g.keyword$DataError);
      }
      reset() {
        if (this.errsCount === void 0)
          throw new Error('add "trackErrors" to keyword definition');
        (0, g.resetErrorsCount)(this.gen, this.errsCount);
      }
      ok(T) {
        this.allErrors || this.gen.if(T);
      }
      setParams(T, B) {
        B ? Object.assign(this.params, T) : (this.params = T);
      }
      block$data(T, B, H = a.nil) {
        this.gen.block(() => {
          (this.check$data(T, H), B());
        });
      }
      check$data(T = a.nil, B = a.nil) {
        if (!this.$data) return;
        const { gen: H, schemaCode: Q, schemaType: re, def: me } = this;
        (H.if((0, a.or)((0, a._)`${Q} === undefined`, B)),
          T !== a.nil && H.assign(T, !0),
          (re.length || me.validateSchema) &&
            (H.elseIf(this.invalid$data()),
            this.$dataError(),
            T !== a.nil && H.assign(T, !1)),
          H.else());
      }
      invalid$data() {
        const { gen: T, schemaCode: B, schemaType: H, def: Q, it: re } = this;
        return (0, a.or)(me(), Me());
        function me() {
          if (H.length) {
            if (!(B instanceof a.Name))
              throw new Error("ajv implementation error");
            const Ne = Array.isArray(H) ? H : [H];
            return (0,
            a._)`${(0, n.checkDataTypes)(Ne, B, re.opts.strictNumbers, n.DataType.Wrong)}`;
          }
          return a.nil;
        }
        function Me() {
          if (Q.validateSchema) {
            const Ne = T.scopeValue("validate$data", { ref: Q.validateSchema });
            return (0, a._)`!${Ne}(${B})`;
          }
          return a.nil;
        }
      }
      subschema(T, B) {
        const H = (0, s.getSubschema)(this.it, T);
        ((0, s.extendSubschemaData)(H, this.it, T),
          (0, s.extendSubschemaMode)(H, T));
        const Q = { ...this.it, ...H, items: void 0, props: void 0 };
        return ($(Q, B), Q);
      }
      mergeEvaluated(T, B) {
        const { it: H, gen: Q } = this;
        H.opts.unevaluated &&
          (H.props !== !0 &&
            T.props !== void 0 &&
            (H.props = c.mergeEvaluated.props(Q, T.props, H.props, B)),
          H.items !== !0 &&
            T.items !== void 0 &&
            (H.items = c.mergeEvaluated.items(Q, T.items, H.items, B)));
      }
      mergeValidEvaluated(T, B) {
        const { it: H, gen: Q } = this;
        if (H.opts.unevaluated && (H.props !== !0 || H.items !== !0))
          return (Q.if(B, () => this.mergeEvaluated(T, a.Name)), !0);
      }
    }
    sr.KeywordCxt = M;
    function X(x, T, B, H) {
      const Q = new M(x, B, T);
      "code" in B
        ? B.code(Q, H)
        : Q.$data && B.validate
          ? (0, o.funcKeywordCode)(Q, B)
          : "macro" in B
            ? (0, o.macroKeywordCode)(Q, B)
            : (B.compile || B.validate) && (0, o.funcKeywordCode)(Q, B);
    }
    const Z = /^\/(?:[^~]|~0|~1)*$/,
      ce = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
    function se(x, { dataLevel: T, dataNames: B, dataPathArr: H }) {
      let Q, re;
      if (x === "") return u.default.rootData;
      if (x[0] === "/") {
        if (!Z.test(x)) throw new Error(`Invalid JSON-pointer: ${x}`);
        ((Q = x), (re = u.default.rootData));
      } else {
        const Ee = ce.exec(x);
        if (!Ee) throw new Error(`Invalid JSON-pointer: ${x}`);
        const we = +Ee[1];
        if (((Q = Ee[2]), Q === "#")) {
          if (we >= T) throw new Error(Ne("property/index", we));
          return H[T - we];
        }
        if (we > T) throw new Error(Ne("data", we));
        if (((re = B[T - we]), !Q)) return re;
      }
      let me = re;
      const Me = Q.split("/");
      for (const Ee of Me)
        Ee &&
          ((re = (0,
          a._)`${re}${(0, a.getProperty)((0, c.unescapeJsonPointer)(Ee))}`),
          (me = (0, a._)`${me} && ${re}`));
      return me;
      function Ne(Ee, we) {
        return `Cannot access ${Ee} ${we} levels up, current level is ${T}`;
      }
    }
    return ((sr.getData = se), sr);
  }
  var Pt = {},
    Ps;
  function ni() {
    if (Ps) return Pt;
    ((Ps = 1), Object.defineProperty(Pt, "__esModule", { value: !0 }));
    class e extends Error {
      constructor(t) {
        (super("validation failed"),
          (this.errors = t),
          (this.ajv = this.validation = !0));
      }
    }
    return ((Pt.default = e), Pt);
  }
  var At = {},
    As;
  function It() {
    if (As) return At;
    ((As = 1), Object.defineProperty(At, "__esModule", { value: !0 }));
    const e = Et();
    class r extends Error {
      constructor(n, i, o, s) {
        (super(s || `can't resolve reference ${o} from id ${i}`),
          (this.missingRef = (0, e.resolveUrl)(n, i, o)),
          (this.missingSchema = (0, e.normalizeId)(
            (0, e.getFullPath)(n, this.missingRef),
          )));
      }
    }
    return ((At.default = r), At);
  }
  var Fe = {},
    Is;
  function Rt() {
    if (Is) return Fe;
    ((Is = 1),
      Object.defineProperty(Fe, "__esModule", { value: !0 }),
      (Fe.resolveSchema =
        Fe.getCompilingSchema =
        Fe.resolveRef =
        Fe.compileSchema =
        Fe.SchemaEnv =
          void 0));
    const e = te(),
      r = ni(),
      t = Ve(),
      n = Et(),
      i = oe(),
      o = St();
    class s {
      constructor(_) {
        var m;
        ((this.refs = {}), (this.dynamicAnchors = {}));
        let $;
        (typeof _.schema == "object" && ($ = _.schema),
          (this.schema = _.schema),
          (this.schemaId = _.schemaId),
          (this.root = _.root || this),
          (this.baseId =
            (m = _.baseId) !== null && m !== void 0
              ? m
              : (0, n.normalizeId)($?.[_.schemaId || "$id"])),
          (this.schemaPath = _.schemaPath),
          (this.localRefs = _.localRefs),
          (this.meta = _.meta),
          (this.$async = $?.$async),
          (this.refs = {}));
      }
    }
    Fe.SchemaEnv = s;
    function a(y) {
      const _ = c.call(this, y);
      if (_) return _;
      const m = (0, n.getFullPath)(this.opts.uriResolver, y.root.baseId),
        { es5: $, lines: P } = this.opts.code,
        { ownProperties: b } = this.opts,
        A = new e.CodeGen(this.scope, { es5: $, lines: P, ownProperties: b });
      let O;
      y.$async &&
        (O = A.scopeValue("Error", {
          ref: r.default,
          code: (0, e._)`require("ajv/dist/runtime/validation_error").default`,
        }));
      const F = A.scopeName("validate");
      y.validateName = F;
      const V = {
        gen: A,
        allErrors: this.opts.allErrors,
        data: t.default.data,
        parentData: t.default.parentData,
        parentDataProperty: t.default.parentDataProperty,
        dataNames: [t.default.data],
        dataPathArr: [e.nil],
        dataLevel: 0,
        dataTypes: [],
        definedProperties: new Set(),
        topSchemaRef: A.scopeValue(
          "schema",
          this.opts.code.source === !0
            ? { ref: y.schema, code: (0, e.stringify)(y.schema) }
            : { ref: y.schema },
        ),
        validateName: F,
        ValidationError: O,
        schema: y.schema,
        schemaEnv: y,
        rootId: m,
        baseId: y.baseId || m,
        schemaPath: e.nil,
        errSchemaPath: y.schemaPath || (this.opts.jtd ? "" : "#"),
        errorPath: (0, e._)`""`,
        opts: this.opts,
        self: this,
      };
      let G;
      try {
        (this._compilations.add(y),
          (0, o.validateFunctionCode)(V),
          A.optimize(this.opts.code.optimize));
        const L = A.toString();
        ((G = `${A.scopeRefs(t.default.scope)}return ${L}`),
          this.opts.code.process && (G = this.opts.code.process(G, y)));
        const Y = new Function(`${t.default.self}`, `${t.default.scope}`, G)(
          this,
          this.scope.get(),
        );
        if (
          (this.scope.value(F, { ref: Y }),
          (Y.errors = null),
          (Y.schema = y.schema),
          (Y.schemaEnv = y),
          y.$async && (Y.$async = !0),
          this.opts.code.source === !0 &&
            (Y.source = {
              validateName: F,
              validateCode: L,
              scopeValues: A._values,
            }),
          this.opts.unevaluated)
        ) {
          const { props: J, items: le } = V;
          ((Y.evaluated = {
            props: J instanceof e.Name ? void 0 : J,
            items: le instanceof e.Name ? void 0 : le,
            dynamicProps: J instanceof e.Name,
            dynamicItems: le instanceof e.Name,
          }),
            Y.source && (Y.source.evaluated = (0, e.stringify)(Y.evaluated)));
        }
        return ((y.validate = Y), y);
      } catch (L) {
        throw (
          delete y.validate,
          delete y.validateName,
          G && this.logger.error("Error compiling schema, function code:", G),
          L
        );
      } finally {
        this._compilations.delete(y);
      }
    }
    Fe.compileSchema = a;
    function u(y, _, m) {
      var $;
      m = (0, n.resolveUrl)(this.opts.uriResolver, _, m);
      const P = y.refs[m];
      if (P) return P;
      let b = h.call(this, y, m);
      if (b === void 0) {
        const A = ($ = y.localRefs) === null || $ === void 0 ? void 0 : $[m],
          { schemaId: O } = this.opts;
        A && (b = new s({ schema: A, schemaId: O, root: y, baseId: _ }));
      }
      if (b !== void 0) return (y.refs[m] = d.call(this, b));
    }
    Fe.resolveRef = u;
    function d(y) {
      return (0, n.inlineRef)(y.schema, this.opts.inlineRefs)
        ? y.schema
        : y.validate
          ? y
          : a.call(this, y);
    }
    function c(y) {
      for (const _ of this._compilations) if (g(_, y)) return _;
    }
    Fe.getCompilingSchema = c;
    function g(y, _) {
      return (
        y.schema === _.schema && y.root === _.root && y.baseId === _.baseId
      );
    }
    function h(y, _) {
      let m;
      for (; typeof (m = this.refs[_]) == "string"; ) _ = m;
      return m || this.schemas[_] || p.call(this, y, _);
    }
    function p(y, _) {
      const m = this.opts.uriResolver.parse(_),
        $ = (0, n._getFullPath)(this.opts.uriResolver, m);
      let P = (0, n.getFullPath)(this.opts.uriResolver, y.baseId, void 0);
      if (Object.keys(y.schema).length > 0 && $ === P)
        return w.call(this, m, y);
      const b = (0, n.normalizeId)($),
        A = this.refs[b] || this.schemas[b];
      if (typeof A == "string") {
        const O = p.call(this, y, A);
        return typeof O?.schema != "object" ? void 0 : w.call(this, m, O);
      }
      if (typeof A?.schema == "object") {
        if ((A.validate || a.call(this, A), b === (0, n.normalizeId)(_))) {
          const { schema: O } = A,
            { schemaId: F } = this.opts,
            V = O[F];
          return (
            V && (P = (0, n.resolveUrl)(this.opts.uriResolver, P, V)),
            new s({ schema: O, schemaId: F, root: y, baseId: P })
          );
        }
        return w.call(this, m, A);
      }
    }
    Fe.resolveSchema = p;
    const v = new Set([
      "properties",
      "patternProperties",
      "enum",
      "dependencies",
      "definitions",
    ]);
    function w(y, { baseId: _, schema: m, root: $ }) {
      var P;
      if (((P = y.fragment) === null || P === void 0 ? void 0 : P[0]) !== "/")
        return;
      for (const O of y.fragment.slice(1).split("/")) {
        if (typeof m == "boolean") return;
        const F = m[(0, i.unescapeFragment)(O)];
        if (F === void 0) return;
        m = F;
        const V = typeof m == "object" && m[this.opts.schemaId];
        !v.has(O) && V && (_ = (0, n.resolveUrl)(this.opts.uriResolver, _, V));
      }
      let b;
      if (
        typeof m != "boolean" &&
        m.$ref &&
        !(0, i.schemaHasRulesButRef)(m, this.RULES)
      ) {
        const O = (0, n.resolveUrl)(this.opts.uriResolver, _, m.$ref);
        b = p.call(this, $, O);
      }
      const { schemaId: A } = this.opts;
      if (
        ((b = b || new s({ schema: m, schemaId: A, root: $, baseId: _ })),
        b.schema !== b.root.schema)
      )
        return b;
    }
    return Fe;
  }
  const Rf = {
    $id: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#",
    description:
      "Meta-schema for $data reference (JSON AnySchema extension proposal)",
    type: "object",
    required: ["$data"],
    properties: {
      $data: {
        type: "string",
        anyOf: [
          { format: "relative-json-pointer" },
          { format: "json-pointer" },
        ],
      },
    },
    additionalProperties: !1,
  };
  var Ot = {},
    et = { exports: {} },
    ii,
    Rs;
  function Os() {
    if (Rs) return ii;
    Rs = 1;
    const e = RegExp.prototype.test.bind(
        /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu,
      ),
      r = RegExp.prototype.test.bind(
        /^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u,
      );
    function t(h) {
      let p = "",
        v = 0,
        w = 0;
      for (w = 0; w < h.length; w++)
        if (((v = h[w].charCodeAt(0)), v !== 48)) {
          if (
            !(
              (v >= 48 && v <= 57) ||
              (v >= 65 && v <= 70) ||
              (v >= 97 && v <= 102)
            )
          )
            return "";
          p += h[w];
          break;
        }
      for (w += 1; w < h.length; w++) {
        if (
          ((v = h[w].charCodeAt(0)),
          !(
            (v >= 48 && v <= 57) ||
            (v >= 65 && v <= 70) ||
            (v >= 97 && v <= 102)
          ))
        )
          return "";
        p += h[w];
      }
      return p;
    }
    const n = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
    function i(h) {
      return ((h.length = 0), !0);
    }
    function o(h, p, v) {
      if (h.length) {
        const w = t(h);
        if (w !== "") p.push(w);
        else return ((v.error = !0), !1);
        h.length = 0;
      }
      return !0;
    }
    function s(h) {
      let p = 0;
      const v = { error: !1, address: "", zone: "" },
        w = [],
        y = [];
      let _ = !1,
        m = !1,
        $ = o;
      for (let P = 0; P < h.length; P++) {
        const b = h[P];
        if (!(b === "[" || b === "]"))
          if (b === ":") {
            if ((_ === !0 && (m = !0), !$(y, w, v))) break;
            if (++p > 7) {
              v.error = !0;
              break;
            }
            (P > 0 && h[P - 1] === ":" && (_ = !0), w.push(":"));
            continue;
          } else if (b === "%") {
            if (!$(y, w, v)) break;
            $ = i;
          } else {
            y.push(b);
            continue;
          }
      }
      return (
        y.length &&
          ($ === i
            ? (v.zone = y.join(""))
            : m
              ? w.push(y.join(""))
              : w.push(t(y))),
        (v.address = w.join("")),
        v
      );
    }
    function a(h) {
      if (u(h, ":") < 2) return { host: h, isIPV6: !1 };
      const p = s(h);
      if (p.error) return { host: h, isIPV6: !1 };
      {
        let v = p.address,
          w = p.address;
        return (
          p.zone && ((v += "%" + p.zone), (w += "%25" + p.zone)),
          { host: v, isIPV6: !0, escapedHost: w }
        );
      }
    }
    function u(h, p) {
      let v = 0;
      for (let w = 0; w < h.length; w++) h[w] === p && v++;
      return v;
    }
    function d(h) {
      let p = h;
      const v = [];
      let w = -1,
        y = 0;
      for (; (y = p.length); ) {
        if (y === 1) {
          if (p === ".") break;
          if (p === "/") {
            v.push("/");
            break;
          } else {
            v.push(p);
            break;
          }
        } else if (y === 2) {
          if (p[0] === ".") {
            if (p[1] === ".") break;
            if (p[1] === "/") {
              p = p.slice(2);
              continue;
            }
          } else if (p[0] === "/" && (p[1] === "." || p[1] === "/")) {
            v.push("/");
            break;
          }
        } else if (y === 3 && p === "/..") {
          (v.length !== 0 && v.pop(), v.push("/"));
          break;
        }
        if (p[0] === ".") {
          if (p[1] === ".") {
            if (p[2] === "/") {
              p = p.slice(3);
              continue;
            }
          } else if (p[1] === "/") {
            p = p.slice(2);
            continue;
          }
        } else if (p[0] === "/" && p[1] === ".") {
          if (p[2] === "/") {
            p = p.slice(2);
            continue;
          } else if (p[2] === "." && p[3] === "/") {
            ((p = p.slice(3)), v.length !== 0 && v.pop());
            continue;
          }
        }
        if ((w = p.indexOf("/", 1)) === -1) {
          v.push(p);
          break;
        } else (v.push(p.slice(0, w)), (p = p.slice(w)));
      }
      return v.join("");
    }
    function c(h, p) {
      const v = p !== !0 ? escape : unescape;
      return (
        h.scheme !== void 0 && (h.scheme = v(h.scheme)),
        h.userinfo !== void 0 && (h.userinfo = v(h.userinfo)),
        h.host !== void 0 && (h.host = v(h.host)),
        h.path !== void 0 && (h.path = v(h.path)),
        h.query !== void 0 && (h.query = v(h.query)),
        h.fragment !== void 0 && (h.fragment = v(h.fragment)),
        h
      );
    }
    function g(h) {
      const p = [];
      if (
        (h.userinfo !== void 0 && (p.push(h.userinfo), p.push("@")),
        h.host !== void 0)
      ) {
        let v = unescape(h.host);
        if (!r(v)) {
          const w = a(v);
          w.isIPV6 === !0 ? (v = `[${w.escapedHost}]`) : (v = h.host);
        }
        p.push(v);
      }
      return (
        (typeof h.port == "number" || typeof h.port == "string") &&
          (p.push(":"), p.push(String(h.port))),
        p.length ? p.join("") : void 0
      );
    }
    return (
      (ii = {
        nonSimpleDomain: n,
        recomposeAuthority: g,
        normalizeComponentEncoding: c,
        removeDotSegments: d,
        isIPv4: r,
        isUUID: e,
        normalizeIPv6: a,
        stringArrayToHexStripped: t,
      }),
      ii
    );
  }
  var oi, Ns;
  function Of() {
    if (Ns) return oi;
    Ns = 1;
    const { isUUID: e } = Os(),
      r = /([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-.:;=@]|%[\da-f]{2})+)/iu,
      t = ["http", "https", "ws", "wss", "urn", "urn:uuid"];
    function n(b) {
      return t.indexOf(b) !== -1;
    }
    function i(b) {
      return b.secure === !0
        ? !0
        : b.secure === !1
          ? !1
          : b.scheme
            ? b.scheme.length === 3 &&
              (b.scheme[0] === "w" || b.scheme[0] === "W") &&
              (b.scheme[1] === "s" || b.scheme[1] === "S") &&
              (b.scheme[2] === "s" || b.scheme[2] === "S")
            : !1;
    }
    function o(b) {
      return (
        b.host || (b.error = b.error || "HTTP URIs must have a host."),
        b
      );
    }
    function s(b) {
      const A = String(b.scheme).toLowerCase() === "https";
      return (
        (b.port === (A ? 443 : 80) || b.port === "") && (b.port = void 0),
        b.path || (b.path = "/"),
        b
      );
    }
    function a(b) {
      return (
        (b.secure = i(b)),
        (b.resourceName = (b.path || "/") + (b.query ? "?" + b.query : "")),
        (b.path = void 0),
        (b.query = void 0),
        b
      );
    }
    function u(b) {
      if (
        ((b.port === (i(b) ? 443 : 80) || b.port === "") && (b.port = void 0),
        typeof b.secure == "boolean" &&
          ((b.scheme = b.secure ? "wss" : "ws"), (b.secure = void 0)),
        b.resourceName)
      ) {
        const [A, O] = b.resourceName.split("?");
        ((b.path = A && A !== "/" ? A : void 0),
          (b.query = O),
          (b.resourceName = void 0));
      }
      return ((b.fragment = void 0), b);
    }
    function d(b, A) {
      if (!b.path) return ((b.error = "URN can not be parsed"), b);
      const O = b.path.match(r);
      if (O) {
        const F = A.scheme || b.scheme || "urn";
        ((b.nid = O[1].toLowerCase()), (b.nss = O[2]));
        const V = `${F}:${A.nid || b.nid}`,
          G = P(V);
        ((b.path = void 0), G && (b = G.parse(b, A)));
      } else b.error = b.error || "URN can not be parsed.";
      return b;
    }
    function c(b, A) {
      if (b.nid === void 0)
        throw new Error("URN without nid cannot be serialized");
      const O = A.scheme || b.scheme || "urn",
        F = b.nid.toLowerCase(),
        V = `${O}:${A.nid || F}`,
        G = P(V);
      G && (b = G.serialize(b, A));
      const L = b,
        W = b.nss;
      return ((L.path = `${F || A.nid}:${W}`), (A.skipEscape = !0), L);
    }
    function g(b, A) {
      const O = b;
      return (
        (O.uuid = O.nss),
        (O.nss = void 0),
        !A.tolerant &&
          (!O.uuid || !e(O.uuid)) &&
          (O.error = O.error || "UUID is not valid."),
        O
      );
    }
    function h(b) {
      const A = b;
      return ((A.nss = (b.uuid || "").toLowerCase()), A);
    }
    const p = { scheme: "http", domainHost: !0, parse: o, serialize: s },
      v = { scheme: "https", domainHost: p.domainHost, parse: o, serialize: s },
      w = { scheme: "ws", domainHost: !0, parse: a, serialize: u },
      y = {
        scheme: "wss",
        domainHost: w.domainHost,
        parse: w.parse,
        serialize: w.serialize,
      },
      $ = {
        http: p,
        https: v,
        ws: w,
        wss: y,
        urn: { scheme: "urn", parse: d, serialize: c, skipNormalize: !0 },
        "urn:uuid": {
          scheme: "urn:uuid",
          parse: g,
          serialize: h,
          skipNormalize: !0,
        },
      };
    Object.setPrototypeOf($, null);
    function P(b) {
      return (b && ($[b] || $[b.toLowerCase()])) || void 0;
    }
    return (
      (oi = {
        wsIsSecure: i,
        SCHEMES: $,
        isValidSchemeName: n,
        getSchemeHandler: P,
      }),
      oi
    );
  }
  var xs;
  function Nf() {
    if (xs) return et.exports;
    xs = 1;
    const {
        normalizeIPv6: e,
        removeDotSegments: r,
        recomposeAuthority: t,
        normalizeComponentEncoding: n,
        isIPv4: i,
        nonSimpleDomain: o,
      } = Os(),
      { SCHEMES: s, getSchemeHandler: a } = Of();
    function u(y, _) {
      return (
        typeof y == "string"
          ? (y = h(v(y, _), _))
          : typeof y == "object" && (y = v(h(y, _), _)),
        y
      );
    }
    function d(y, _, m) {
      const $ = m ? Object.assign({ scheme: "null" }, m) : { scheme: "null" },
        P = c(v(y, $), v(_, $), $, !0);
      return (($.skipEscape = !0), h(P, $));
    }
    function c(y, _, m, $) {
      const P = {};
      return (
        $ || ((y = v(h(y, m), m)), (_ = v(h(_, m), m))),
        (m = m || {}),
        !m.tolerant && _.scheme
          ? ((P.scheme = _.scheme),
            (P.userinfo = _.userinfo),
            (P.host = _.host),
            (P.port = _.port),
            (P.path = r(_.path || "")),
            (P.query = _.query))
          : (_.userinfo !== void 0 || _.host !== void 0 || _.port !== void 0
              ? ((P.userinfo = _.userinfo),
                (P.host = _.host),
                (P.port = _.port),
                (P.path = r(_.path || "")),
                (P.query = _.query))
              : (_.path
                  ? (_.path[0] === "/"
                      ? (P.path = r(_.path))
                      : ((y.userinfo !== void 0 ||
                          y.host !== void 0 ||
                          y.port !== void 0) &&
                        !y.path
                          ? (P.path = "/" + _.path)
                          : y.path
                            ? (P.path =
                                y.path.slice(0, y.path.lastIndexOf("/") + 1) +
                                _.path)
                            : (P.path = _.path),
                        (P.path = r(P.path))),
                    (P.query = _.query))
                  : ((P.path = y.path),
                    _.query !== void 0
                      ? (P.query = _.query)
                      : (P.query = y.query)),
                (P.userinfo = y.userinfo),
                (P.host = y.host),
                (P.port = y.port)),
            (P.scheme = y.scheme)),
        (P.fragment = _.fragment),
        P
      );
    }
    function g(y, _, m) {
      return (
        typeof y == "string"
          ? ((y = unescape(y)),
            (y = h(n(v(y, m), !0), { ...m, skipEscape: !0 })))
          : typeof y == "object" && (y = h(n(y, !0), { ...m, skipEscape: !0 })),
        typeof _ == "string"
          ? ((_ = unescape(_)),
            (_ = h(n(v(_, m), !0), { ...m, skipEscape: !0 })))
          : typeof _ == "object" && (_ = h(n(_, !0), { ...m, skipEscape: !0 })),
        y.toLowerCase() === _.toLowerCase()
      );
    }
    function h(y, _) {
      const m = {
          host: y.host,
          scheme: y.scheme,
          userinfo: y.userinfo,
          port: y.port,
          path: y.path,
          query: y.query,
          nid: y.nid,
          nss: y.nss,
          uuid: y.uuid,
          fragment: y.fragment,
          reference: y.reference,
          resourceName: y.resourceName,
          secure: y.secure,
          error: "",
        },
        $ = Object.assign({}, _),
        P = [],
        b = a($.scheme || m.scheme);
      (b && b.serialize && b.serialize(m, $),
        m.path !== void 0 &&
          ($.skipEscape
            ? (m.path = unescape(m.path))
            : ((m.path = escape(m.path)),
              m.scheme !== void 0 && (m.path = m.path.split("%3A").join(":")))),
        $.reference !== "suffix" && m.scheme && P.push(m.scheme, ":"));
      const A = t(m);
      if (
        (A !== void 0 &&
          ($.reference !== "suffix" && P.push("//"),
          P.push(A),
          m.path && m.path[0] !== "/" && P.push("/")),
        m.path !== void 0)
      ) {
        let O = m.path;
        (!$.absolutePath && (!b || !b.absolutePath) && (O = r(O)),
          A === void 0 &&
            O[0] === "/" &&
            O[1] === "/" &&
            (O = "/%2F" + O.slice(2)),
          P.push(O));
      }
      return (
        m.query !== void 0 && P.push("?", m.query),
        m.fragment !== void 0 && P.push("#", m.fragment),
        P.join("")
      );
    }
    const p =
      /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
    function v(y, _) {
      const m = Object.assign({}, _),
        $ = {
          scheme: void 0,
          userinfo: void 0,
          host: "",
          port: void 0,
          path: "",
          query: void 0,
          fragment: void 0,
        };
      let P = !1;
      m.reference === "suffix" &&
        (m.scheme ? (y = m.scheme + ":" + y) : (y = "//" + y));
      const b = y.match(p);
      if (b) {
        if (
          (($.scheme = b[1]),
          ($.userinfo = b[3]),
          ($.host = b[4]),
          ($.port = parseInt(b[5], 10)),
          ($.path = b[6] || ""),
          ($.query = b[7]),
          ($.fragment = b[8]),
          isNaN($.port) && ($.port = b[5]),
          $.host)
        )
          if (i($.host) === !1) {
            const F = e($.host);
            (($.host = F.host.toLowerCase()), (P = F.isIPV6));
          } else P = !0;
        ($.scheme === void 0 &&
        $.userinfo === void 0 &&
        $.host === void 0 &&
        $.port === void 0 &&
        $.query === void 0 &&
        !$.path
          ? ($.reference = "same-document")
          : $.scheme === void 0
            ? ($.reference = "relative")
            : $.fragment === void 0
              ? ($.reference = "absolute")
              : ($.reference = "uri"),
          m.reference &&
            m.reference !== "suffix" &&
            m.reference !== $.reference &&
            ($.error =
              $.error || "URI is not a " + m.reference + " reference."));
        const A = a(m.scheme || $.scheme);
        if (
          !m.unicodeSupport &&
          (!A || !A.unicodeSupport) &&
          $.host &&
          (m.domainHost || (A && A.domainHost)) &&
          P === !1 &&
          o($.host)
        )
          try {
            $.host = URL.domainToASCII($.host.toLowerCase());
          } catch (O) {
            $.error =
              $.error ||
              "Host's domain name can not be converted to ASCII: " + O;
          }
        ((!A || (A && !A.skipNormalize)) &&
          (y.indexOf("%") !== -1 &&
            ($.scheme !== void 0 && ($.scheme = unescape($.scheme)),
            $.host !== void 0 && ($.host = unescape($.host))),
          $.path && ($.path = escape(unescape($.path))),
          $.fragment &&
            ($.fragment = encodeURI(decodeURIComponent($.fragment)))),
          A && A.parse && A.parse($, m));
      } else $.error = $.error || "URI can not be parsed.";
      return $;
    }
    const w = {
      SCHEMES: s,
      normalize: u,
      resolve: d,
      resolveComponent: c,
      equal: g,
      serialize: h,
      parse: v,
    };
    return (
      (et.exports = w),
      (et.exports.default = w),
      (et.exports.fastUri = w),
      et.exports
    );
  }
  var ks;
  function xf() {
    if (ks) return Ot;
    ((ks = 1), Object.defineProperty(Ot, "__esModule", { value: !0 }));
    const e = Nf();
    return (
      (e.code = 'require("ajv/dist/runtime/uri").default'),
      (Ot.default = e),
      Ot
    );
  }
  var Ts;
  function kf() {
    return (
      Ts ||
        ((Ts = 1),
        (function (e) {
          (Object.defineProperty(e, "__esModule", { value: !0 }),
            (e.CodeGen =
              e.Name =
              e.nil =
              e.stringify =
              e.str =
              e._ =
              e.KeywordCxt =
                void 0));
          var r = St();
          Object.defineProperty(e, "KeywordCxt", {
            enumerable: !0,
            get: function () {
              return r.KeywordCxt;
            },
          });
          var t = te();
          (Object.defineProperty(e, "_", {
            enumerable: !0,
            get: function () {
              return t._;
            },
          }),
            Object.defineProperty(e, "str", {
              enumerable: !0,
              get: function () {
                return t.str;
              },
            }),
            Object.defineProperty(e, "stringify", {
              enumerable: !0,
              get: function () {
                return t.stringify;
              },
            }),
            Object.defineProperty(e, "nil", {
              enumerable: !0,
              get: function () {
                return t.nil;
              },
            }),
            Object.defineProperty(e, "Name", {
              enumerable: !0,
              get: function () {
                return t.Name;
              },
            }),
            Object.defineProperty(e, "CodeGen", {
              enumerable: !0,
              get: function () {
                return t.CodeGen;
              },
            }));
          const n = ni(),
            i = It(),
            o = ds(),
            s = Rt(),
            a = te(),
            u = Et(),
            d = bt(),
            c = oe(),
            g = Rf,
            h = xf(),
            p = (z, k) => new RegExp(z, k);
          p.code = "new RegExp";
          const v = ["removeAdditional", "useDefaults", "coerceTypes"],
            w = new Set([
              "validate",
              "serialize",
              "parse",
              "wrapper",
              "root",
              "schema",
              "keyword",
              "pattern",
              "formats",
              "validate$data",
              "func",
              "obj",
              "Error",
            ]),
            y = {
              errorDataPath: "",
              format: "`validateFormats: false` can be used instead.",
              nullable: '"nullable" keyword is supported by default.',
              jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
              extendRefs:
                "Deprecated ignoreKeywordsWithRef can be used instead.",
              missingRefs:
                "Pass empty schema with $id that should be ignored to ajv.addSchema.",
              processCode:
                "Use option `code: {process: (code, schemaEnv: object) => string}`",
              sourceCode: "Use option `code: {source: true}`",
              strictDefaults: "It is default now, see option `strict`.",
              strictKeywords: "It is default now, see option `strict`.",
              uniqueItems: '"uniqueItems" keyword is always validated.',
              unknownFormats:
                "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
              cache: "Map is used as cache, schema object as key.",
              serialize: "Map is used as cache, schema object as key.",
              ajvErrors: "It is default now.",
            },
            _ = {
              ignoreKeywordsWithRef: "",
              jsPropertySyntax: "",
              unicode:
                '"minLength"/"maxLength" account for unicode characters by default.',
            },
            m = 200;
          function $(z) {
            var k,
              U,
              C,
              S,
              R,
              M,
              X,
              Z,
              ce,
              se,
              x,
              T,
              B,
              H,
              Q,
              re,
              me,
              Me,
              Ne,
              Ee,
              we,
              vr,
              Te,
              _r,
              je;
            const lr = z.strict,
              nt = (k = z.code) === null || k === void 0 ? void 0 : k.optimize,
              Ge = nt === !0 || nt === void 0 ? 1 : nt || 0,
              Sn =
                (C =
                  (U = z.code) === null || U === void 0 ? void 0 : U.regExp) !==
                  null && C !== void 0
                  ? C
                  : p,
              E = (S = z.uriResolver) !== null && S !== void 0 ? S : h.default;
            return {
              strictSchema:
                (M = (R = z.strictSchema) !== null && R !== void 0 ? R : lr) !==
                  null && M !== void 0
                  ? M
                  : !0,
              strictNumbers:
                (Z =
                  (X = z.strictNumbers) !== null && X !== void 0 ? X : lr) !==
                  null && Z !== void 0
                  ? Z
                  : !0,
              strictTypes:
                (se =
                  (ce = z.strictTypes) !== null && ce !== void 0 ? ce : lr) !==
                  null && se !== void 0
                  ? se
                  : "log",
              strictTuples:
                (T = (x = z.strictTuples) !== null && x !== void 0 ? x : lr) !==
                  null && T !== void 0
                  ? T
                  : "log",
              strictRequired:
                (H =
                  (B = z.strictRequired) !== null && B !== void 0 ? B : lr) !==
                  null && H !== void 0
                  ? H
                  : !1,
              code: z.code
                ? { ...z.code, optimize: Ge, regExp: Sn }
                : { optimize: Ge, regExp: Sn },
              loopRequired:
                (Q = z.loopRequired) !== null && Q !== void 0 ? Q : m,
              loopEnum: (re = z.loopEnum) !== null && re !== void 0 ? re : m,
              meta: (me = z.meta) !== null && me !== void 0 ? me : !0,
              messages: (Me = z.messages) !== null && Me !== void 0 ? Me : !0,
              inlineRefs:
                (Ne = z.inlineRefs) !== null && Ne !== void 0 ? Ne : !0,
              schemaId:
                (Ee = z.schemaId) !== null && Ee !== void 0 ? Ee : "$id",
              addUsedSchema:
                (we = z.addUsedSchema) !== null && we !== void 0 ? we : !0,
              validateSchema:
                (vr = z.validateSchema) !== null && vr !== void 0 ? vr : !0,
              validateFormats:
                (Te = z.validateFormats) !== null && Te !== void 0 ? Te : !0,
              unicodeRegExp:
                (_r = z.unicodeRegExp) !== null && _r !== void 0 ? _r : !0,
              int32range:
                (je = z.int32range) !== null && je !== void 0 ? je : !0,
              uriResolver: E,
            };
          }
          class P {
            constructor(k = {}) {
              ((this.schemas = {}),
                (this.refs = {}),
                (this.formats = {}),
                (this._compilations = new Set()),
                (this._loading = {}),
                (this._cache = new Map()),
                (k = this.opts = { ...k, ...$(k) }));
              const { es5: U, lines: C } = this.opts.code;
              ((this.scope = new a.ValueScope({
                scope: {},
                prefixes: w,
                es5: U,
                lines: C,
              })),
                (this.logger = W(k.logger)));
              const S = k.validateFormats;
              ((k.validateFormats = !1),
                (this.RULES = (0, o.getRules)()),
                b.call(this, y, k, "NOT SUPPORTED"),
                b.call(this, _, k, "DEPRECATED", "warn"),
                (this._metaOpts = G.call(this)),
                k.formats && F.call(this),
                this._addVocabularies(),
                this._addDefaultMetaSchema(),
                k.keywords && V.call(this, k.keywords),
                typeof k.meta == "object" && this.addMetaSchema(k.meta),
                O.call(this),
                (k.validateFormats = S));
            }
            _addVocabularies() {
              this.addKeyword("$async");
            }
            _addDefaultMetaSchema() {
              const { $data: k, meta: U, schemaId: C } = this.opts;
              let S = g;
              (C === "id" && ((S = { ...g }), (S.id = S.$id), delete S.$id),
                U && k && this.addMetaSchema(S, S[C], !1));
            }
            defaultMeta() {
              const { meta: k, schemaId: U } = this.opts;
              return (this.opts.defaultMeta =
                typeof k == "object" ? k[U] || k : void 0);
            }
            validate(k, U) {
              let C;
              if (typeof k == "string") {
                if (((C = this.getSchema(k)), !C))
                  throw new Error(`no schema with key or ref "${k}"`);
              } else C = this.compile(k);
              const S = C(U);
              return ("$async" in C || (this.errors = C.errors), S);
            }
            compile(k, U) {
              const C = this._addSchema(k, U);
              return C.validate || this._compileSchemaEnv(C);
            }
            compileAsync(k, U) {
              if (typeof this.opts.loadSchema != "function")
                throw new Error("options.loadSchema should be a function");
              const { loadSchema: C } = this.opts;
              return S.call(this, k, U);
              async function S(se, x) {
                await R.call(this, se.$schema);
                const T = this._addSchema(se, x);
                return T.validate || M.call(this, T);
              }
              async function R(se) {
                se &&
                  !this.getSchema(se) &&
                  (await S.call(this, { $ref: se }, !0));
              }
              async function M(se) {
                try {
                  return this._compileSchemaEnv(se);
                } catch (x) {
                  if (!(x instanceof i.default)) throw x;
                  return (
                    X.call(this, x),
                    await Z.call(this, x.missingSchema),
                    M.call(this, se)
                  );
                }
              }
              function X({ missingSchema: se, missingRef: x }) {
                if (this.refs[se])
                  throw new Error(
                    `AnySchema ${se} is loaded but ${x} cannot be resolved`,
                  );
              }
              async function Z(se) {
                const x = await ce.call(this, se);
                (this.refs[se] || (await R.call(this, x.$schema)),
                  this.refs[se] || this.addSchema(x, se, U));
              }
              async function ce(se) {
                const x = this._loading[se];
                if (x) return x;
                try {
                  return await (this._loading[se] = C(se));
                } finally {
                  delete this._loading[se];
                }
              }
            }
            addSchema(k, U, C, S = this.opts.validateSchema) {
              if (Array.isArray(k)) {
                for (const M of k) this.addSchema(M, void 0, C, S);
                return this;
              }
              let R;
              if (typeof k == "object") {
                const { schemaId: M } = this.opts;
                if (((R = k[M]), R !== void 0 && typeof R != "string"))
                  throw new Error(`schema ${M} must be string`);
              }
              return (
                (U = (0, u.normalizeId)(U || R)),
                this._checkUnique(U),
                (this.schemas[U] = this._addSchema(k, C, U, S, !0)),
                this
              );
            }
            addMetaSchema(k, U, C = this.opts.validateSchema) {
              return (this.addSchema(k, U, !0, C), this);
            }
            validateSchema(k, U) {
              if (typeof k == "boolean") return !0;
              let C;
              if (((C = k.$schema), C !== void 0 && typeof C != "string"))
                throw new Error("$schema must be a string");
              if (((C = C || this.opts.defaultMeta || this.defaultMeta()), !C))
                return (
                  this.logger.warn("meta-schema not available"),
                  (this.errors = null),
                  !0
                );
              const S = this.validate(C, k);
              if (!S && U) {
                const R = "schema is invalid: " + this.errorsText();
                if (this.opts.validateSchema === "log") this.logger.error(R);
                else throw new Error(R);
              }
              return S;
            }
            getSchema(k) {
              let U;
              for (; typeof (U = A.call(this, k)) == "string"; ) k = U;
              if (U === void 0) {
                const { schemaId: C } = this.opts,
                  S = new s.SchemaEnv({ schema: {}, schemaId: C });
                if (((U = s.resolveSchema.call(this, S, k)), !U)) return;
                this.refs[k] = U;
              }
              return U.validate || this._compileSchemaEnv(U);
            }
            removeSchema(k) {
              if (k instanceof RegExp)
                return (
                  this._removeAllSchemas(this.schemas, k),
                  this._removeAllSchemas(this.refs, k),
                  this
                );
              switch (typeof k) {
                case "undefined":
                  return (
                    this._removeAllSchemas(this.schemas),
                    this._removeAllSchemas(this.refs),
                    this._cache.clear(),
                    this
                  );
                case "string": {
                  const U = A.call(this, k);
                  return (
                    typeof U == "object" && this._cache.delete(U.schema),
                    delete this.schemas[k],
                    delete this.refs[k],
                    this
                  );
                }
                case "object": {
                  const U = k;
                  this._cache.delete(U);
                  let C = k[this.opts.schemaId];
                  return (
                    C &&
                      ((C = (0, u.normalizeId)(C)),
                      delete this.schemas[C],
                      delete this.refs[C]),
                    this
                  );
                }
                default:
                  throw new Error("ajv.removeSchema: invalid parameter");
              }
            }
            addVocabulary(k) {
              for (const U of k) this.addKeyword(U);
              return this;
            }
            addKeyword(k, U) {
              let C;
              if (typeof k == "string")
                ((C = k),
                  typeof U == "object" &&
                    (this.logger.warn(
                      "these parameters are deprecated, see docs for addKeyword",
                    ),
                    (U.keyword = C)));
              else if (typeof k == "object" && U === void 0) {
                if (((U = k), (C = U.keyword), Array.isArray(C) && !C.length))
                  throw new Error(
                    "addKeywords: keyword must be string or non-empty array",
                  );
              } else throw new Error("invalid addKeywords parameters");
              if ((J.call(this, C, U), !U))
                return ((0, c.eachItem)(C, (R) => le.call(this, R)), this);
              be.call(this, U);
              const S = {
                ...U,
                type: (0, d.getJSONTypes)(U.type),
                schemaType: (0, d.getJSONTypes)(U.schemaType),
              };
              return (
                (0, c.eachItem)(
                  C,
                  S.type.length === 0
                    ? (R) => le.call(this, R, S)
                    : (R) => S.type.forEach((M) => le.call(this, R, S, M)),
                ),
                this
              );
            }
            getKeyword(k) {
              const U = this.RULES.all[k];
              return typeof U == "object" ? U.definition : !!U;
            }
            removeKeyword(k) {
              const { RULES: U } = this;
              (delete U.keywords[k], delete U.all[k]);
              for (const C of U.rules) {
                const S = C.rules.findIndex((R) => R.keyword === k);
                S >= 0 && C.rules.splice(S, 1);
              }
              return this;
            }
            addFormat(k, U) {
              return (
                typeof U == "string" && (U = new RegExp(U)),
                (this.formats[k] = U),
                this
              );
            }
            errorsText(
              k = this.errors,
              { separator: U = ", ", dataVar: C = "data" } = {},
            ) {
              return !k || k.length === 0
                ? "No errors"
                : k
                    .map((S) => `${C}${S.instancePath} ${S.message}`)
                    .reduce((S, R) => S + U + R);
            }
            $dataMetaSchema(k, U) {
              const C = this.RULES.all;
              k = JSON.parse(JSON.stringify(k));
              for (const S of U) {
                const R = S.split("/").slice(1);
                let M = k;
                for (const X of R) M = M[X];
                for (const X in C) {
                  const Z = C[X];
                  if (typeof Z != "object") continue;
                  const { $data: ce } = Z.definition,
                    se = M[X];
                  ce && se && (M[X] = De(se));
                }
              }
              return k;
            }
            _removeAllSchemas(k, U) {
              for (const C in k) {
                const S = k[C];
                (!U || U.test(C)) &&
                  (typeof S == "string"
                    ? delete k[C]
                    : S &&
                      !S.meta &&
                      (this._cache.delete(S.schema), delete k[C]));
              }
            }
            _addSchema(
              k,
              U,
              C,
              S = this.opts.validateSchema,
              R = this.opts.addUsedSchema,
            ) {
              let M;
              const { schemaId: X } = this.opts;
              if (typeof k == "object") M = k[X];
              else {
                if (this.opts.jtd) throw new Error("schema must be object");
                if (typeof k != "boolean")
                  throw new Error("schema must be object or boolean");
              }
              let Z = this._cache.get(k);
              if (Z !== void 0) return Z;
              C = (0, u.normalizeId)(M || C);
              const ce = u.getSchemaRefs.call(this, k, C);
              return (
                (Z = new s.SchemaEnv({
                  schema: k,
                  schemaId: X,
                  meta: U,
                  baseId: C,
                  localRefs: ce,
                })),
                this._cache.set(Z.schema, Z),
                R &&
                  !C.startsWith("#") &&
                  (C && this._checkUnique(C), (this.refs[C] = Z)),
                S && this.validateSchema(k, !0),
                Z
              );
            }
            _checkUnique(k) {
              if (this.schemas[k] || this.refs[k])
                throw new Error(`schema with key or id "${k}" already exists`);
            }
            _compileSchemaEnv(k) {
              if (
                (k.meta
                  ? this._compileMetaSchema(k)
                  : s.compileSchema.call(this, k),
                !k.validate)
              )
                throw new Error("ajv implementation error");
              return k.validate;
            }
            _compileMetaSchema(k) {
              const U = this.opts;
              this.opts = this._metaOpts;
              try {
                s.compileSchema.call(this, k);
              } finally {
                this.opts = U;
              }
            }
          }
          ((P.ValidationError = n.default),
            (P.MissingRefError = i.default),
            (e.default = P));
          function b(z, k, U, C = "error") {
            for (const S in z) {
              const R = S;
              R in k && this.logger[C](`${U}: option ${S}. ${z[R]}`);
            }
          }
          function A(z) {
            return (
              (z = (0, u.normalizeId)(z)),
              this.schemas[z] || this.refs[z]
            );
          }
          function O() {
            const z = this.opts.schemas;
            if (z)
              if (Array.isArray(z)) this.addSchema(z);
              else for (const k in z) this.addSchema(z[k], k);
          }
          function F() {
            for (const z in this.opts.formats) {
              const k = this.opts.formats[z];
              k && this.addFormat(z, k);
            }
          }
          function V(z) {
            if (Array.isArray(z)) {
              this.addVocabulary(z);
              return;
            }
            this.logger.warn(
              "keywords option as map is deprecated, pass array",
            );
            for (const k in z) {
              const U = z[k];
              (U.keyword || (U.keyword = k), this.addKeyword(U));
            }
          }
          function G() {
            const z = { ...this.opts };
            for (const k of v) delete z[k];
            return z;
          }
          const L = { log() {}, warn() {}, error() {} };
          function W(z) {
            if (z === !1) return L;
            if (z === void 0) return console;
            if (z.log && z.warn && z.error) return z;
            throw new Error(
              "logger must implement log, warn and error methods",
            );
          }
          const Y = /^[a-z_$][a-z0-9_$:-]*$/i;
          function J(z, k) {
            const { RULES: U } = this;
            if (
              ((0, c.eachItem)(z, (C) => {
                if (U.keywords[C])
                  throw new Error(`Keyword ${C} is already defined`);
                if (!Y.test(C))
                  throw new Error(`Keyword ${C} has invalid name`);
              }),
              !!k && k.$data && !("code" in k || "validate" in k))
            )
              throw new Error(
                '$data keyword must have "code" or "validate" function',
              );
          }
          function le(z, k, U) {
            var C;
            const S = k?.post;
            if (U && S)
              throw new Error('keyword with "post" flag cannot have "type"');
            const { RULES: R } = this;
            let M = S ? R.post : R.rules.find(({ type: Z }) => Z === U);
            if (
              (M || ((M = { type: U, rules: [] }), R.rules.push(M)),
              (R.keywords[z] = !0),
              !k)
            )
              return;
            const X = {
              keyword: z,
              definition: {
                ...k,
                type: (0, d.getJSONTypes)(k.type),
                schemaType: (0, d.getJSONTypes)(k.schemaType),
              },
            };
            (k.before ? Ie.call(this, M, X, k.before) : M.rules.push(X),
              (R.all[z] = X),
              (C = k.implements) === null ||
                C === void 0 ||
                C.forEach((Z) => this.addKeyword(Z)));
          }
          function Ie(z, k, U) {
            const C = z.rules.findIndex((S) => S.keyword === U);
            C >= 0
              ? z.rules.splice(C, 0, k)
              : (z.rules.push(k), this.logger.warn(`rule ${U} is not defined`));
          }
          function be(z) {
            let { metaSchema: k } = z;
            k !== void 0 &&
              (z.$data && this.opts.$data && (k = De(k)),
              (z.validateSchema = this.compile(k, !0)));
          }
          const ue = {
            $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#",
          };
          function De(z) {
            return { anyOf: [z, ue] };
          }
        })(Jn)),
      Jn
    );
  }
  var Nt = {},
    xt = {},
    kt = {},
    Cs;
  function Tf() {
    if (Cs) return kt;
    ((Cs = 1), Object.defineProperty(kt, "__esModule", { value: !0 }));
    const e = {
      keyword: "id",
      code() {
        throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
      },
    };
    return ((kt.default = e), kt);
  }
  var hr = {},
    js;
  function si() {
    if (js) return hr;
    ((js = 1),
      Object.defineProperty(hr, "__esModule", { value: !0 }),
      (hr.callRef = hr.getValidate = void 0));
    const e = It(),
      r = Ke(),
      t = te(),
      n = Ve(),
      i = Rt(),
      o = oe(),
      s = {
        keyword: "$ref",
        schemaType: "string",
        code(d) {
          const { gen: c, schema: g, it: h } = d,
            { baseId: p, schemaEnv: v, validateName: w, opts: y, self: _ } = h,
            { root: m } = v;
          if ((g === "#" || g === "#/") && p === m.baseId) return P();
          const $ = i.resolveRef.call(_, m, p, g);
          if ($ === void 0) throw new e.default(h.opts.uriResolver, p, g);
          if ($ instanceof i.SchemaEnv) return b($);
          return A($);
          function P() {
            if (v === m) return u(d, w, v, v.$async);
            const O = c.scopeValue("root", { ref: m });
            return u(d, (0, t._)`${O}.validate`, m, m.$async);
          }
          function b(O) {
            const F = a(d, O);
            u(d, F, O, O.$async);
          }
          function A(O) {
            const F = c.scopeValue(
                "schema",
                y.code.source === !0
                  ? { ref: O, code: (0, t.stringify)(O) }
                  : { ref: O },
              ),
              V = c.name("valid"),
              G = d.subschema(
                {
                  schema: O,
                  dataTypes: [],
                  schemaPath: t.nil,
                  topSchemaRef: F,
                  errSchemaPath: g,
                },
                V,
              );
            (d.mergeEvaluated(G), d.ok(V));
          }
        },
      };
    function a(d, c) {
      const { gen: g } = d;
      return c.validate
        ? g.scopeValue("validate", { ref: c.validate })
        : (0, t._)`${g.scopeValue("wrapper", { ref: c })}.validate`;
    }
    hr.getValidate = a;
    function u(d, c, g, h) {
      const { gen: p, it: v } = d,
        { allErrors: w, schemaEnv: y, opts: _ } = v,
        m = _.passContext ? n.default.this : t.nil;
      h ? $() : P();
      function $() {
        if (!y.$async)
          throw new Error("async schema referenced by sync schema");
        const O = p.let("valid");
        (p.try(
          () => {
            (p.code((0, t._)`await ${(0, r.callValidateCode)(d, c, m)}`),
              A(c),
              w || p.assign(O, !0));
          },
          (F) => {
            (p.if((0, t._)`!(${F} instanceof ${v.ValidationError})`, () =>
              p.throw(F),
            ),
              b(F),
              w || p.assign(O, !1));
          },
        ),
          d.ok(O));
      }
      function P() {
        d.result(
          (0, r.callValidateCode)(d, c, m),
          () => A(c),
          () => b(c),
        );
      }
      function b(O) {
        const F = (0, t._)`${O}.errors`;
        (p.assign(
          n.default.vErrors,
          (0,
          t._)`${n.default.vErrors} === null ? ${F} : ${n.default.vErrors}.concat(${F})`,
        ),
          p.assign(n.default.errors, (0, t._)`${n.default.vErrors}.length`));
      }
      function A(O) {
        var F;
        if (!v.opts.unevaluated) return;
        const V =
          (F = g?.validate) === null || F === void 0 ? void 0 : F.evaluated;
        if (v.props !== !0)
          if (V && !V.dynamicProps)
            V.props !== void 0 &&
              (v.props = o.mergeEvaluated.props(p, V.props, v.props));
          else {
            const G = p.var("props", (0, t._)`${O}.evaluated.props`);
            v.props = o.mergeEvaluated.props(p, G, v.props, t.Name);
          }
        if (v.items !== !0)
          if (V && !V.dynamicItems)
            V.items !== void 0 &&
              (v.items = o.mergeEvaluated.items(p, V.items, v.items));
          else {
            const G = p.var("items", (0, t._)`${O}.evaluated.items`);
            v.items = o.mergeEvaluated.items(p, G, v.items, t.Name);
          }
      }
    }
    return ((hr.callRef = u), (hr.default = s), hr);
  }
  var Fs;
  function Cf() {
    if (Fs) return xt;
    ((Fs = 1), Object.defineProperty(xt, "__esModule", { value: !0 }));
    const e = Tf(),
      r = si(),
      t = [
        "$schema",
        "$id",
        "$defs",
        "$vocabulary",
        { keyword: "$comment" },
        "definitions",
        e.default,
        r.default,
      ];
    return ((xt.default = t), xt);
  }
  var Tt = {},
    Ct = {},
    Ds;
  function jf() {
    if (Ds) return Ct;
    ((Ds = 1), Object.defineProperty(Ct, "__esModule", { value: !0 }));
    const e = te(),
      r = e.operators,
      t = {
        maximum: { okStr: "<=", ok: r.LTE, fail: r.GT },
        minimum: { okStr: ">=", ok: r.GTE, fail: r.LT },
        exclusiveMaximum: { okStr: "<", ok: r.LT, fail: r.GTE },
        exclusiveMinimum: { okStr: ">", ok: r.GT, fail: r.LTE },
      },
      n = {
        message: ({ keyword: o, schemaCode: s }) =>
          (0, e.str)`must be ${t[o].okStr} ${s}`,
        params: ({ keyword: o, schemaCode: s }) =>
          (0, e._)`{comparison: ${t[o].okStr}, limit: ${s}}`,
      },
      i = {
        keyword: Object.keys(t),
        type: "number",
        schemaType: "number",
        $data: !0,
        error: n,
        code(o) {
          const { keyword: s, data: a, schemaCode: u } = o;
          o.fail$data((0, e._)`${a} ${t[s].fail} ${u} || isNaN(${a})`);
        },
      };
    return ((Ct.default = i), Ct);
  }
  var jt = {},
    Ms;
  function Ff() {
    if (Ms) return jt;
    ((Ms = 1), Object.defineProperty(jt, "__esModule", { value: !0 }));
    const e = te(),
      t = {
        keyword: "multipleOf",
        type: "number",
        schemaType: "number",
        $data: !0,
        error: {
          message: ({ schemaCode: n }) => (0, e.str)`must be multiple of ${n}`,
          params: ({ schemaCode: n }) => (0, e._)`{multipleOf: ${n}}`,
        },
        code(n) {
          const { gen: i, data: o, schemaCode: s, it: a } = n,
            u = a.opts.multipleOfPrecision,
            d = i.let("res"),
            c = u
              ? (0, e._)`Math.abs(Math.round(${d}) - ${d}) > 1e-${u}`
              : (0, e._)`${d} !== parseInt(${d})`;
          n.fail$data((0, e._)`(${s} === 0 || (${d} = ${o}/${s}, ${c}))`);
        },
      };
    return ((jt.default = t), jt);
  }
  var Ft = {},
    Dt = {},
    qs;
  function Df() {
    if (qs) return Dt;
    ((qs = 1), Object.defineProperty(Dt, "__esModule", { value: !0 }));
    function e(r) {
      const t = r.length;
      let n = 0,
        i = 0,
        o;
      for (; i < t; )
        (n++,
          (o = r.charCodeAt(i++)),
          o >= 55296 &&
            o <= 56319 &&
            i < t &&
            ((o = r.charCodeAt(i)), (o & 64512) === 56320 && i++));
      return n;
    }
    return (
      (Dt.default = e),
      (e.code = 'require("ajv/dist/runtime/ucs2length").default'),
      Dt
    );
  }
  var Ls;
  function Mf() {
    if (Ls) return Ft;
    ((Ls = 1), Object.defineProperty(Ft, "__esModule", { value: !0 }));
    const e = te(),
      r = oe(),
      t = Df(),
      i = {
        keyword: ["maxLength", "minLength"],
        type: "string",
        schemaType: "number",
        $data: !0,
        error: {
          message({ keyword: o, schemaCode: s }) {
            const a = o === "maxLength" ? "more" : "fewer";
            return (0, e.str)`must NOT have ${a} than ${s} characters`;
          },
          params: ({ schemaCode: o }) => (0, e._)`{limit: ${o}}`,
        },
        code(o) {
          const { keyword: s, data: a, schemaCode: u, it: d } = o,
            c = s === "maxLength" ? e.operators.GT : e.operators.LT,
            g =
              d.opts.unicode === !1
                ? (0, e._)`${a}.length`
                : (0, e._)`${(0, r.useFunc)(o.gen, t.default)}(${a})`;
          o.fail$data((0, e._)`${g} ${c} ${u}`);
        },
      };
    return ((Ft.default = i), Ft);
  }
  var Mt = {},
    Bs;
  function qf() {
    if (Bs) return Mt;
    ((Bs = 1), Object.defineProperty(Mt, "__esModule", { value: !0 }));
    const e = Ke(),
      r = oe(),
      t = te(),
      i = {
        keyword: "pattern",
        type: "string",
        schemaType: "string",
        $data: !0,
        error: {
          message: ({ schemaCode: o }) => (0, t.str)`must match pattern "${o}"`,
          params: ({ schemaCode: o }) => (0, t._)`{pattern: ${o}}`,
        },
        code(o) {
          const {
              gen: s,
              data: a,
              $data: u,
              schema: d,
              schemaCode: c,
              it: g,
            } = o,
            h = g.opts.unicodeRegExp ? "u" : "";
          if (u) {
            const { regExp: p } = g.opts.code,
              v =
                p.code === "new RegExp"
                  ? (0, t._)`new RegExp`
                  : (0, r.useFunc)(s, p),
              w = s.let("valid");
            (s.try(
              () => s.assign(w, (0, t._)`${v}(${c}, ${h}).test(${a})`),
              () => s.assign(w, !1),
            ),
              o.fail$data((0, t._)`!${w}`));
          } else {
            const p = (0, e.usePattern)(o, d);
            o.fail$data((0, t._)`!${p}.test(${a})`);
          }
        },
      };
    return ((Mt.default = i), Mt);
  }
  var qt = {},
    Us;
  function Lf() {
    if (Us) return qt;
    ((Us = 1), Object.defineProperty(qt, "__esModule", { value: !0 }));
    const e = te(),
      t = {
        keyword: ["maxProperties", "minProperties"],
        type: "object",
        schemaType: "number",
        $data: !0,
        error: {
          message({ keyword: n, schemaCode: i }) {
            const o = n === "maxProperties" ? "more" : "fewer";
            return (0, e.str)`must NOT have ${o} than ${i} properties`;
          },
          params: ({ schemaCode: n }) => (0, e._)`{limit: ${n}}`,
        },
        code(n) {
          const { keyword: i, data: o, schemaCode: s } = n,
            a = i === "maxProperties" ? e.operators.GT : e.operators.LT;
          n.fail$data((0, e._)`Object.keys(${o}).length ${a} ${s}`);
        },
      };
    return ((qt.default = t), qt);
  }
  var Lt = {},
    Vs;
  function Bf() {
    if (Vs) return Lt;
    ((Vs = 1), Object.defineProperty(Lt, "__esModule", { value: !0 }));
    const e = Ke(),
      r = te(),
      t = oe(),
      i = {
        keyword: "required",
        type: "object",
        schemaType: "array",
        $data: !0,
        error: {
          message: ({ params: { missingProperty: o } }) =>
            (0, r.str)`must have required property '${o}'`,
          params: ({ params: { missingProperty: o } }) =>
            (0, r._)`{missingProperty: ${o}}`,
        },
        code(o) {
          const {
              gen: s,
              schema: a,
              schemaCode: u,
              data: d,
              $data: c,
              it: g,
            } = o,
            { opts: h } = g;
          if (!c && a.length === 0) return;
          const p = a.length >= h.loopRequired;
          if ((g.allErrors ? v() : w(), h.strictRequired)) {
            const m = o.parentSchema.properties,
              { definedProperties: $ } = o.it;
            for (const P of a)
              if (m?.[P] === void 0 && !$.has(P)) {
                const b = g.schemaEnv.baseId + g.errSchemaPath,
                  A = `required property "${P}" is not defined at "${b}" (strictRequired)`;
                (0, t.checkStrictMode)(g, A, g.opts.strictRequired);
              }
          }
          function v() {
            if (p || c) o.block$data(r.nil, y);
            else for (const m of a) (0, e.checkReportMissingProp)(o, m);
          }
          function w() {
            const m = s.let("missing");
            if (p || c) {
              const $ = s.let("valid", !0);
              (o.block$data($, () => _(m, $)), o.ok($));
            } else
              (s.if((0, e.checkMissingProp)(o, a, m)),
                (0, e.reportMissingProp)(o, m),
                s.else());
          }
          function y() {
            s.forOf("prop", u, (m) => {
              (o.setParams({ missingProperty: m }),
                s.if((0, e.noPropertyInData)(s, d, m, h.ownProperties), () =>
                  o.error(),
                ));
            });
          }
          function _(m, $) {
            (o.setParams({ missingProperty: m }),
              s.forOf(
                m,
                u,
                () => {
                  (s.assign($, (0, e.propertyInData)(s, d, m, h.ownProperties)),
                    s.if((0, r.not)($), () => {
                      (o.error(), s.break());
                    }));
                },
                r.nil,
              ));
          }
        },
      };
    return ((Lt.default = i), Lt);
  }
  var Bt = {},
    zs;
  function Uf() {
    if (zs) return Bt;
    ((zs = 1), Object.defineProperty(Bt, "__esModule", { value: !0 }));
    const e = te(),
      t = {
        keyword: ["maxItems", "minItems"],
        type: "array",
        schemaType: "number",
        $data: !0,
        error: {
          message({ keyword: n, schemaCode: i }) {
            const o = n === "maxItems" ? "more" : "fewer";
            return (0, e.str)`must NOT have ${o} than ${i} items`;
          },
          params: ({ schemaCode: n }) => (0, e._)`{limit: ${n}}`,
        },
        code(n) {
          const { keyword: i, data: o, schemaCode: s } = n,
            a = i === "maxItems" ? e.operators.GT : e.operators.LT;
          n.fail$data((0, e._)`${o}.length ${a} ${s}`);
        },
      };
    return ((Bt.default = t), Bt);
  }
  var Ut = {},
    Vt = {},
    Ks;
  function ai() {
    if (Ks) return Vt;
    ((Ks = 1), Object.defineProperty(Vt, "__esModule", { value: !0 }));
    const e = ws();
    return (
      (e.code = 'require("ajv/dist/runtime/equal").default'),
      (Vt.default = e),
      Vt
    );
  }
  var Hs;
  function Vf() {
    if (Hs) return Ut;
    ((Hs = 1), Object.defineProperty(Ut, "__esModule", { value: !0 }));
    const e = bt(),
      r = te(),
      t = oe(),
      n = ai(),
      o = {
        keyword: "uniqueItems",
        type: "array",
        schemaType: "boolean",
        $data: !0,
        error: {
          message: ({ params: { i: s, j: a } }) =>
            (0,
            r.str)`must NOT have duplicate items (items ## ${a} and ${s} are identical)`,
          params: ({ params: { i: s, j: a } }) => (0, r._)`{i: ${s}, j: ${a}}`,
        },
        code(s) {
          const {
            gen: a,
            data: u,
            $data: d,
            schema: c,
            parentSchema: g,
            schemaCode: h,
            it: p,
          } = s;
          if (!d && !c) return;
          const v = a.let("valid"),
            w = g.items ? (0, e.getSchemaTypes)(g.items) : [];
          (s.block$data(v, y, (0, r._)`${h} === false`), s.ok(v));
          function y() {
            const P = a.let("i", (0, r._)`${u}.length`),
              b = a.let("j");
            (s.setParams({ i: P, j: b }),
              a.assign(v, !0),
              a.if((0, r._)`${P} > 1`, () => (_() ? m : $)(P, b)));
          }
          function _() {
            return (
              w.length > 0 && !w.some((P) => P === "object" || P === "array")
            );
          }
          function m(P, b) {
            const A = a.name("item"),
              O = (0, e.checkDataTypes)(
                w,
                A,
                p.opts.strictNumbers,
                e.DataType.Wrong,
              ),
              F = a.const("indices", (0, r._)`{}`);
            a.for((0, r._)`;${P}--;`, () => {
              (a.let(A, (0, r._)`${u}[${P}]`),
                a.if(O, (0, r._)`continue`),
                w.length > 1 &&
                  a.if(
                    (0, r._)`typeof ${A} == "string"`,
                    (0, r._)`${A} += "_"`,
                  ),
                a
                  .if((0, r._)`typeof ${F}[${A}] == "number"`, () => {
                    (a.assign(b, (0, r._)`${F}[${A}]`),
                      s.error(),
                      a.assign(v, !1).break());
                  })
                  .code((0, r._)`${F}[${A}] = ${P}`));
            });
          }
          function $(P, b) {
            const A = (0, t.useFunc)(a, n.default),
              O = a.name("outer");
            a.label(O).for((0, r._)`;${P}--;`, () =>
              a.for((0, r._)`${b} = ${P}; ${b}--;`, () =>
                a.if((0, r._)`${A}(${u}[${P}], ${u}[${b}])`, () => {
                  (s.error(), a.assign(v, !1).break(O));
                }),
              ),
            );
          }
        },
      };
    return ((Ut.default = o), Ut);
  }
  var zt = {},
    Ws;
  function zf() {
    if (Ws) return zt;
    ((Ws = 1), Object.defineProperty(zt, "__esModule", { value: !0 }));
    const e = te(),
      r = oe(),
      t = ai(),
      i = {
        keyword: "const",
        $data: !0,
        error: {
          message: "must be equal to constant",
          params: ({ schemaCode: o }) => (0, e._)`{allowedValue: ${o}}`,
        },
        code(o) {
          const { gen: s, data: a, $data: u, schemaCode: d, schema: c } = o;
          u || (c && typeof c == "object")
            ? o.fail$data(
                (0, e._)`!${(0, r.useFunc)(s, t.default)}(${a}, ${d})`,
              )
            : o.fail((0, e._)`${c} !== ${a}`);
        },
      };
    return ((zt.default = i), zt);
  }
  var Kt = {},
    Gs;
  function Kf() {
    if (Gs) return Kt;
    ((Gs = 1), Object.defineProperty(Kt, "__esModule", { value: !0 }));
    const e = te(),
      r = oe(),
      t = ai(),
      i = {
        keyword: "enum",
        schemaType: "array",
        $data: !0,
        error: {
          message: "must be equal to one of the allowed values",
          params: ({ schemaCode: o }) => (0, e._)`{allowedValues: ${o}}`,
        },
        code(o) {
          const {
            gen: s,
            data: a,
            $data: u,
            schema: d,
            schemaCode: c,
            it: g,
          } = o;
          if (!u && d.length === 0)
            throw new Error("enum must have non-empty array");
          const h = d.length >= g.opts.loopEnum;
          let p;
          const v = () => p ?? (p = (0, r.useFunc)(s, t.default));
          let w;
          if (h || u) ((w = s.let("valid")), o.block$data(w, y));
          else {
            if (!Array.isArray(d)) throw new Error("ajv implementation error");
            const m = s.const("vSchema", c);
            w = (0, e.or)(...d.map(($, P) => _(m, P)));
          }
          o.pass(w);
          function y() {
            (s.assign(w, !1),
              s.forOf("v", c, (m) =>
                s.if((0, e._)`${v()}(${a}, ${m})`, () =>
                  s.assign(w, !0).break(),
                ),
              ));
          }
          function _(m, $) {
            const P = d[$];
            return typeof P == "object" && P !== null
              ? (0, e._)`${v()}(${a}, ${m}[${$}])`
              : (0, e._)`${a} === ${P}`;
          }
        },
      };
    return ((Kt.default = i), Kt);
  }
  var Ys;
  function Hf() {
    if (Ys) return Tt;
    ((Ys = 1), Object.defineProperty(Tt, "__esModule", { value: !0 }));
    const e = jf(),
      r = Ff(),
      t = Mf(),
      n = qf(),
      i = Lf(),
      o = Bf(),
      s = Uf(),
      a = Vf(),
      u = zf(),
      d = Kf(),
      c = [
        e.default,
        r.default,
        t.default,
        n.default,
        i.default,
        o.default,
        s.default,
        a.default,
        { keyword: "type", schemaType: ["string", "array"] },
        { keyword: "nullable", schemaType: "boolean" },
        u.default,
        d.default,
      ];
    return ((Tt.default = c), Tt);
  }
  var Ht = {},
    Dr = {},
    Js;
  function Xs() {
    if (Js) return Dr;
    ((Js = 1),
      Object.defineProperty(Dr, "__esModule", { value: !0 }),
      (Dr.validateAdditionalItems = void 0));
    const e = te(),
      r = oe(),
      n = {
        keyword: "additionalItems",
        type: "array",
        schemaType: ["boolean", "object"],
        before: "uniqueItems",
        error: {
          message: ({ params: { len: o } }) =>
            (0, e.str)`must NOT have more than ${o} items`,
          params: ({ params: { len: o } }) => (0, e._)`{limit: ${o}}`,
        },
        code(o) {
          const { parentSchema: s, it: a } = o,
            { items: u } = s;
          if (!Array.isArray(u)) {
            (0, r.checkStrictMode)(
              a,
              '"additionalItems" is ignored when "items" is not an array of schemas',
            );
            return;
          }
          i(o, u);
        },
      };
    function i(o, s) {
      const { gen: a, schema: u, data: d, keyword: c, it: g } = o;
      g.items = !0;
      const h = a.const("len", (0, e._)`${d}.length`);
      if (u === !1)
        (o.setParams({ len: s.length }), o.pass((0, e._)`${h} <= ${s.length}`));
      else if (typeof u == "object" && !(0, r.alwaysValidSchema)(g, u)) {
        const v = a.var("valid", (0, e._)`${h} <= ${s.length}`);
        (a.if((0, e.not)(v), () => p(v)), o.ok(v));
      }
      function p(v) {
        a.forRange("i", s.length, h, (w) => {
          (o.subschema(
            { keyword: c, dataProp: w, dataPropType: r.Type.Num },
            v,
          ),
            g.allErrors || a.if((0, e.not)(v), () => a.break()));
        });
      }
    }
    return ((Dr.validateAdditionalItems = i), (Dr.default = n), Dr);
  }
  var Wt = {},
    Mr = {},
    Qs;
  function Zs() {
    if (Qs) return Mr;
    ((Qs = 1),
      Object.defineProperty(Mr, "__esModule", { value: !0 }),
      (Mr.validateTuple = void 0));
    const e = te(),
      r = oe(),
      t = Ke(),
      n = {
        keyword: "items",
        type: "array",
        schemaType: ["object", "array", "boolean"],
        before: "uniqueItems",
        code(o) {
          const { schema: s, it: a } = o;
          if (Array.isArray(s)) return i(o, "additionalItems", s);
          ((a.items = !0),
            !(0, r.alwaysValidSchema)(a, s) && o.ok((0, t.validateArray)(o)));
        },
      };
    function i(o, s, a = o.schema) {
      const { gen: u, parentSchema: d, data: c, keyword: g, it: h } = o;
      (w(d),
        h.opts.unevaluated &&
          a.length &&
          h.items !== !0 &&
          (h.items = r.mergeEvaluated.items(u, a.length, h.items)));
      const p = u.name("valid"),
        v = u.const("len", (0, e._)`${c}.length`);
      a.forEach((y, _) => {
        (0, r.alwaysValidSchema)(h, y) ||
          (u.if((0, e._)`${v} > ${_}`, () =>
            o.subschema({ keyword: g, schemaProp: _, dataProp: _ }, p),
          ),
          o.ok(p));
      });
      function w(y) {
        const { opts: _, errSchemaPath: m } = h,
          $ = a.length,
          P = $ === y.minItems && ($ === y.maxItems || y[s] === !1);
        if (_.strictTuples && !P) {
          const b = `"${g}" is ${$}-tuple, but minItems or maxItems/${s} are not specified or different at path "${m}"`;
          (0, r.checkStrictMode)(h, b, _.strictTuples);
        }
      }
    }
    return ((Mr.validateTuple = i), (Mr.default = n), Mr);
  }
  var ea;
  function Wf() {
    if (ea) return Wt;
    ((ea = 1), Object.defineProperty(Wt, "__esModule", { value: !0 }));
    const e = Zs(),
      r = {
        keyword: "prefixItems",
        type: "array",
        schemaType: ["array"],
        before: "uniqueItems",
        code: (t) => (0, e.validateTuple)(t, "items"),
      };
    return ((Wt.default = r), Wt);
  }
  var Gt = {},
    ra;
  function Gf() {
    if (ra) return Gt;
    ((ra = 1), Object.defineProperty(Gt, "__esModule", { value: !0 }));
    const e = te(),
      r = oe(),
      t = Ke(),
      n = Xs(),
      o = {
        keyword: "items",
        type: "array",
        schemaType: ["object", "boolean"],
        before: "uniqueItems",
        error: {
          message: ({ params: { len: s } }) =>
            (0, e.str)`must NOT have more than ${s} items`,
          params: ({ params: { len: s } }) => (0, e._)`{limit: ${s}}`,
        },
        code(s) {
          const { schema: a, parentSchema: u, it: d } = s,
            { prefixItems: c } = u;
          ((d.items = !0),
            !(0, r.alwaysValidSchema)(d, a) &&
              (c
                ? (0, n.validateAdditionalItems)(s, c)
                : s.ok((0, t.validateArray)(s))));
        },
      };
    return ((Gt.default = o), Gt);
  }
  var Yt = {},
    ta;
  function Yf() {
    if (ta) return Yt;
    ((ta = 1), Object.defineProperty(Yt, "__esModule", { value: !0 }));
    const e = te(),
      r = oe(),
      n = {
        keyword: "contains",
        type: "array",
        schemaType: ["object", "boolean"],
        before: "uniqueItems",
        trackErrors: !0,
        error: {
          message: ({ params: { min: i, max: o } }) =>
            o === void 0
              ? (0, e.str)`must contain at least ${i} valid item(s)`
              : (0,
                e.str)`must contain at least ${i} and no more than ${o} valid item(s)`,
          params: ({ params: { min: i, max: o } }) =>
            o === void 0
              ? (0, e._)`{minContains: ${i}}`
              : (0, e._)`{minContains: ${i}, maxContains: ${o}}`,
        },
        code(i) {
          const { gen: o, schema: s, parentSchema: a, data: u, it: d } = i;
          let c, g;
          const { minContains: h, maxContains: p } = a;
          d.opts.next ? ((c = h === void 0 ? 1 : h), (g = p)) : (c = 1);
          const v = o.const("len", (0, e._)`${u}.length`);
          if ((i.setParams({ min: c, max: g }), g === void 0 && c === 0)) {
            (0, r.checkStrictMode)(
              d,
              '"minContains" == 0 without "maxContains": "contains" keyword ignored',
            );
            return;
          }
          if (g !== void 0 && c > g) {
            ((0, r.checkStrictMode)(
              d,
              '"minContains" > "maxContains" is always invalid',
            ),
              i.fail());
            return;
          }
          if ((0, r.alwaysValidSchema)(d, s)) {
            let $ = (0, e._)`${v} >= ${c}`;
            (g !== void 0 && ($ = (0, e._)`${$} && ${v} <= ${g}`), i.pass($));
            return;
          }
          d.items = !0;
          const w = o.name("valid");
          (g === void 0 && c === 1
            ? _(w, () => o.if(w, () => o.break()))
            : c === 0
              ? (o.let(w, !0),
                g !== void 0 && o.if((0, e._)`${u}.length > 0`, y))
              : (o.let(w, !1), y()),
            i.result(w, () => i.reset()));
          function y() {
            const $ = o.name("_valid"),
              P = o.let("count", 0);
            _($, () => o.if($, () => m(P)));
          }
          function _($, P) {
            o.forRange("i", 0, v, (b) => {
              (i.subschema(
                {
                  keyword: "contains",
                  dataProp: b,
                  dataPropType: r.Type.Num,
                  compositeRule: !0,
                },
                $,
              ),
                P());
            });
          }
          function m($) {
            (o.code((0, e._)`${$}++`),
              g === void 0
                ? o.if((0, e._)`${$} >= ${c}`, () => o.assign(w, !0).break())
                : (o.if((0, e._)`${$} > ${g}`, () => o.assign(w, !1).break()),
                  c === 1
                    ? o.assign(w, !0)
                    : o.if((0, e._)`${$} >= ${c}`, () => o.assign(w, !0))));
          }
        },
      };
    return ((Yt.default = n), Yt);
  }
  var ci = {},
    na;
  function li() {
    return (
      na ||
        ((na = 1),
        (function (e) {
          (Object.defineProperty(e, "__esModule", { value: !0 }),
            (e.validateSchemaDeps = e.validatePropertyDeps = e.error = void 0));
          const r = te(),
            t = oe(),
            n = Ke();
          e.error = {
            message: ({ params: { property: u, depsCount: d, deps: c } }) => {
              const g = d === 1 ? "property" : "properties";
              return (0,
              r.str)`must have ${g} ${c} when property ${u} is present`;
            },
            params: ({
              params: {
                property: u,
                depsCount: d,
                deps: c,
                missingProperty: g,
              },
            }) => (0, r._)`{property: ${u},
    missingProperty: ${g},
    depsCount: ${d},
    deps: ${c}}`,
          };
          const i = {
            keyword: "dependencies",
            type: "object",
            schemaType: "object",
            error: e.error,
            code(u) {
              const [d, c] = o(u);
              (s(u, d), a(u, c));
            },
          };
          function o({ schema: u }) {
            const d = {},
              c = {};
            for (const g in u) {
              if (g === "__proto__") continue;
              const h = Array.isArray(u[g]) ? d : c;
              h[g] = u[g];
            }
            return [d, c];
          }
          function s(u, d = u.schema) {
            const { gen: c, data: g, it: h } = u;
            if (Object.keys(d).length === 0) return;
            const p = c.let("missing");
            for (const v in d) {
              const w = d[v];
              if (w.length === 0) continue;
              const y = (0, n.propertyInData)(c, g, v, h.opts.ownProperties);
              (u.setParams({
                property: v,
                depsCount: w.length,
                deps: w.join(", "),
              }),
                h.allErrors
                  ? c.if(y, () => {
                      for (const _ of w) (0, n.checkReportMissingProp)(u, _);
                    })
                  : (c.if(
                      (0, r._)`${y} && (${(0, n.checkMissingProp)(u, w, p)})`,
                    ),
                    (0, n.reportMissingProp)(u, p),
                    c.else()));
            }
          }
          e.validatePropertyDeps = s;
          function a(u, d = u.schema) {
            const { gen: c, data: g, keyword: h, it: p } = u,
              v = c.name("valid");
            for (const w in d)
              (0, t.alwaysValidSchema)(p, d[w]) ||
                (c.if(
                  (0, n.propertyInData)(c, g, w, p.opts.ownProperties),
                  () => {
                    const y = u.subschema({ keyword: h, schemaProp: w }, v);
                    u.mergeValidEvaluated(y, v);
                  },
                  () => c.var(v, !0),
                ),
                u.ok(v));
          }
          ((e.validateSchemaDeps = a), (e.default = i));
        })(ci)),
      ci
    );
  }
  var Jt = {},
    ia;
  function Jf() {
    if (ia) return Jt;
    ((ia = 1), Object.defineProperty(Jt, "__esModule", { value: !0 }));
    const e = te(),
      r = oe(),
      n = {
        keyword: "propertyNames",
        type: "object",
        schemaType: ["object", "boolean"],
        error: {
          message: "property name must be valid",
          params: ({ params: i }) =>
            (0, e._)`{propertyName: ${i.propertyName}}`,
        },
        code(i) {
          const { gen: o, schema: s, data: a, it: u } = i;
          if ((0, r.alwaysValidSchema)(u, s)) return;
          const d = o.name("valid");
          (o.forIn("key", a, (c) => {
            (i.setParams({ propertyName: c }),
              i.subschema(
                {
                  keyword: "propertyNames",
                  data: c,
                  dataTypes: ["string"],
                  propertyName: c,
                  compositeRule: !0,
                },
                d,
              ),
              o.if((0, e.not)(d), () => {
                (i.error(!0), u.allErrors || o.break());
              }));
          }),
            i.ok(d));
        },
      };
    return ((Jt.default = n), Jt);
  }
  var Xt = {},
    oa;
  function sa() {
    if (oa) return Xt;
    ((oa = 1), Object.defineProperty(Xt, "__esModule", { value: !0 }));
    const e = Ke(),
      r = te(),
      t = Ve(),
      n = oe(),
      o = {
        keyword: "additionalProperties",
        type: ["object"],
        schemaType: ["boolean", "object"],
        allowUndefined: !0,
        trackErrors: !0,
        error: {
          message: "must NOT have additional properties",
          params: ({ params: s }) =>
            (0, r._)`{additionalProperty: ${s.additionalProperty}}`,
        },
        code(s) {
          const {
            gen: a,
            schema: u,
            parentSchema: d,
            data: c,
            errsCount: g,
            it: h,
          } = s;
          if (!g) throw new Error("ajv implementation error");
          const { allErrors: p, opts: v } = h;
          if (
            ((h.props = !0),
            v.removeAdditional !== "all" && (0, n.alwaysValidSchema)(h, u))
          )
            return;
          const w = (0, e.allSchemaProperties)(d.properties),
            y = (0, e.allSchemaProperties)(d.patternProperties);
          (_(), s.ok((0, r._)`${g} === ${t.default.errors}`));
          function _() {
            a.forIn("key", c, (A) => {
              !w.length && !y.length ? P(A) : a.if(m(A), () => P(A));
            });
          }
          function m(A) {
            let O;
            if (w.length > 8) {
              const F = (0, n.schemaRefOrVal)(h, d.properties, "properties");
              O = (0, e.isOwnProperty)(a, F, A);
            } else
              w.length
                ? (O = (0, r.or)(...w.map((F) => (0, r._)`${A} === ${F}`)))
                : (O = r.nil);
            return (
              y.length &&
                (O = (0, r.or)(
                  O,
                  ...y.map(
                    (F) => (0, r._)`${(0, e.usePattern)(s, F)}.test(${A})`,
                  ),
                )),
              (0, r.not)(O)
            );
          }
          function $(A) {
            a.code((0, r._)`delete ${c}[${A}]`);
          }
          function P(A) {
            if (
              v.removeAdditional === "all" ||
              (v.removeAdditional && u === !1)
            ) {
              $(A);
              return;
            }
            if (u === !1) {
              (s.setParams({ additionalProperty: A }),
                s.error(),
                p || a.break());
              return;
            }
            if (typeof u == "object" && !(0, n.alwaysValidSchema)(h, u)) {
              const O = a.name("valid");
              v.removeAdditional === "failing"
                ? (b(A, O, !1),
                  a.if((0, r.not)(O), () => {
                    (s.reset(), $(A));
                  }))
                : (b(A, O), p || a.if((0, r.not)(O), () => a.break()));
            }
          }
          function b(A, O, F) {
            const V = {
              keyword: "additionalProperties",
              dataProp: A,
              dataPropType: n.Type.Str,
            };
            (F === !1 &&
              Object.assign(V, {
                compositeRule: !0,
                createErrors: !1,
                allErrors: !1,
              }),
              s.subschema(V, O));
          }
        },
      };
    return ((Xt.default = o), Xt);
  }
  var Qt = {},
    aa;
  function Xf() {
    if (aa) return Qt;
    ((aa = 1), Object.defineProperty(Qt, "__esModule", { value: !0 }));
    const e = St(),
      r = Ke(),
      t = oe(),
      n = sa(),
      i = {
        keyword: "properties",
        type: "object",
        schemaType: "object",
        code(o) {
          const { gen: s, schema: a, parentSchema: u, data: d, it: c } = o;
          c.opts.removeAdditional === "all" &&
            u.additionalProperties === void 0 &&
            n.default.code(
              new e.KeywordCxt(c, n.default, "additionalProperties"),
            );
          const g = (0, r.allSchemaProperties)(a);
          for (const y of g) c.definedProperties.add(y);
          c.opts.unevaluated &&
            g.length &&
            c.props !== !0 &&
            (c.props = t.mergeEvaluated.props(s, (0, t.toHash)(g), c.props));
          const h = g.filter((y) => !(0, t.alwaysValidSchema)(c, a[y]));
          if (h.length === 0) return;
          const p = s.name("valid");
          for (const y of h)
            (v(y)
              ? w(y)
              : (s.if((0, r.propertyInData)(s, d, y, c.opts.ownProperties)),
                w(y),
                c.allErrors || s.else().var(p, !0),
                s.endIf()),
              o.it.definedProperties.add(y),
              o.ok(p));
          function v(y) {
            return (
              c.opts.useDefaults && !c.compositeRule && a[y].default !== void 0
            );
          }
          function w(y) {
            o.subschema(
              { keyword: "properties", schemaProp: y, dataProp: y },
              p,
            );
          }
        },
      };
    return ((Qt.default = i), Qt);
  }
  var Zt = {},
    ca;
  function Qf() {
    if (ca) return Zt;
    ((ca = 1), Object.defineProperty(Zt, "__esModule", { value: !0 }));
    const e = Ke(),
      r = te(),
      t = oe(),
      n = oe(),
      i = {
        keyword: "patternProperties",
        type: "object",
        schemaType: "object",
        code(o) {
          const { gen: s, schema: a, data: u, parentSchema: d, it: c } = o,
            { opts: g } = c,
            h = (0, e.allSchemaProperties)(a),
            p = h.filter((P) => (0, t.alwaysValidSchema)(c, a[P]));
          if (
            h.length === 0 ||
            (p.length === h.length && (!c.opts.unevaluated || c.props === !0))
          )
            return;
          const v =
              g.strictSchema && !g.allowMatchingProperties && d.properties,
            w = s.name("valid");
          c.props !== !0 &&
            !(c.props instanceof r.Name) &&
            (c.props = (0, n.evaluatedPropsToName)(s, c.props));
          const { props: y } = c;
          _();
          function _() {
            for (const P of h)
              (v && m(P), c.allErrors ? $(P) : (s.var(w, !0), $(P), s.if(w)));
          }
          function m(P) {
            for (const b in v)
              new RegExp(P).test(b) &&
                (0, t.checkStrictMode)(
                  c,
                  `property ${b} matches pattern ${P} (use allowMatchingProperties)`,
                );
          }
          function $(P) {
            s.forIn("key", u, (b) => {
              s.if((0, r._)`${(0, e.usePattern)(o, P)}.test(${b})`, () => {
                const A = p.includes(P);
                (A ||
                  o.subschema(
                    {
                      keyword: "patternProperties",
                      schemaProp: P,
                      dataProp: b,
                      dataPropType: n.Type.Str,
                    },
                    w,
                  ),
                  c.opts.unevaluated && y !== !0
                    ? s.assign((0, r._)`${y}[${b}]`, !0)
                    : !A &&
                      !c.allErrors &&
                      s.if((0, r.not)(w), () => s.break()));
              });
            });
          }
        },
      };
    return ((Zt.default = i), Zt);
  }
  var en = {},
    la;
  function Zf() {
    if (la) return en;
    ((la = 1), Object.defineProperty(en, "__esModule", { value: !0 }));
    const e = oe(),
      r = {
        keyword: "not",
        schemaType: ["object", "boolean"],
        trackErrors: !0,
        code(t) {
          const { gen: n, schema: i, it: o } = t;
          if ((0, e.alwaysValidSchema)(o, i)) {
            t.fail();
            return;
          }
          const s = n.name("valid");
          (t.subschema(
            {
              keyword: "not",
              compositeRule: !0,
              createErrors: !1,
              allErrors: !1,
            },
            s,
          ),
            t.failResult(
              s,
              () => t.reset(),
              () => t.error(),
            ));
        },
        error: { message: "must NOT be valid" },
      };
    return ((en.default = r), en);
  }
  var rn = {},
    ua;
  function ed() {
    if (ua) return rn;
    ((ua = 1), Object.defineProperty(rn, "__esModule", { value: !0 }));
    const r = {
      keyword: "anyOf",
      schemaType: "array",
      trackErrors: !0,
      code: Ke().validateUnion,
      error: { message: "must match a schema in anyOf" },
    };
    return ((rn.default = r), rn);
  }
  var tn = {},
    fa;
  function rd() {
    if (fa) return tn;
    ((fa = 1), Object.defineProperty(tn, "__esModule", { value: !0 }));
    const e = te(),
      r = oe(),
      n = {
        keyword: "oneOf",
        schemaType: "array",
        trackErrors: !0,
        error: {
          message: "must match exactly one schema in oneOf",
          params: ({ params: i }) => (0, e._)`{passingSchemas: ${i.passing}}`,
        },
        code(i) {
          const { gen: o, schema: s, parentSchema: a, it: u } = i;
          if (!Array.isArray(s)) throw new Error("ajv implementation error");
          if (u.opts.discriminator && a.discriminator) return;
          const d = s,
            c = o.let("valid", !1),
            g = o.let("passing", null),
            h = o.name("_valid");
          (i.setParams({ passing: g }),
            o.block(p),
            i.result(
              c,
              () => i.reset(),
              () => i.error(!0),
            ));
          function p() {
            d.forEach((v, w) => {
              let y;
              ((0, r.alwaysValidSchema)(u, v)
                ? o.var(h, !0)
                : (y = i.subschema(
                    { keyword: "oneOf", schemaProp: w, compositeRule: !0 },
                    h,
                  )),
                w > 0 &&
                  o
                    .if((0, e._)`${h} && ${c}`)
                    .assign(c, !1)
                    .assign(g, (0, e._)`[${g}, ${w}]`)
                    .else(),
                o.if(h, () => {
                  (o.assign(c, !0),
                    o.assign(g, w),
                    y && i.mergeEvaluated(y, e.Name));
                }));
            });
          }
        },
      };
    return ((tn.default = n), tn);
  }
  var nn = {},
    da;
  function td() {
    if (da) return nn;
    ((da = 1), Object.defineProperty(nn, "__esModule", { value: !0 }));
    const e = oe(),
      r = {
        keyword: "allOf",
        schemaType: "array",
        code(t) {
          const { gen: n, schema: i, it: o } = t;
          if (!Array.isArray(i)) throw new Error("ajv implementation error");
          const s = n.name("valid");
          i.forEach((a, u) => {
            if ((0, e.alwaysValidSchema)(o, a)) return;
            const d = t.subschema({ keyword: "allOf", schemaProp: u }, s);
            (t.ok(s), t.mergeEvaluated(d));
          });
        },
      };
    return ((nn.default = r), nn);
  }
  var on = {},
    pa;
  function nd() {
    if (pa) return on;
    ((pa = 1), Object.defineProperty(on, "__esModule", { value: !0 }));
    const e = te(),
      r = oe(),
      n = {
        keyword: "if",
        schemaType: ["object", "boolean"],
        trackErrors: !0,
        error: {
          message: ({ params: o }) =>
            (0, e.str)`must match "${o.ifClause}" schema`,
          params: ({ params: o }) => (0, e._)`{failingKeyword: ${o.ifClause}}`,
        },
        code(o) {
          const { gen: s, parentSchema: a, it: u } = o;
          a.then === void 0 &&
            a.else === void 0 &&
            (0, r.checkStrictMode)(
              u,
              '"if" without "then" and "else" is ignored',
            );
          const d = i(u, "then"),
            c = i(u, "else");
          if (!d && !c) return;
          const g = s.let("valid", !0),
            h = s.name("_valid");
          if ((p(), o.reset(), d && c)) {
            const w = s.let("ifClause");
            (o.setParams({ ifClause: w }), s.if(h, v("then", w), v("else", w)));
          } else d ? s.if(h, v("then")) : s.if((0, e.not)(h), v("else"));
          o.pass(g, () => o.error(!0));
          function p() {
            const w = o.subschema(
              {
                keyword: "if",
                compositeRule: !0,
                createErrors: !1,
                allErrors: !1,
              },
              h,
            );
            o.mergeEvaluated(w);
          }
          function v(w, y) {
            return () => {
              const _ = o.subschema({ keyword: w }, h);
              (s.assign(g, h),
                o.mergeValidEvaluated(_, g),
                y ? s.assign(y, (0, e._)`${w}`) : o.setParams({ ifClause: w }));
            };
          }
        },
      };
    function i(o, s) {
      const a = o.schema[s];
      return a !== void 0 && !(0, r.alwaysValidSchema)(o, a);
    }
    return ((on.default = n), on);
  }
  var sn = {},
    ha;
  function id() {
    if (ha) return sn;
    ((ha = 1), Object.defineProperty(sn, "__esModule", { value: !0 }));
    const e = oe(),
      r = {
        keyword: ["then", "else"],
        schemaType: ["object", "boolean"],
        code({ keyword: t, parentSchema: n, it: i }) {
          n.if === void 0 &&
            (0, e.checkStrictMode)(i, `"${t}" without "if" is ignored`);
        },
      };
    return ((sn.default = r), sn);
  }
  var ma;
  function od() {
    if (ma) return Ht;
    ((ma = 1), Object.defineProperty(Ht, "__esModule", { value: !0 }));
    const e = Xs(),
      r = Wf(),
      t = Zs(),
      n = Gf(),
      i = Yf(),
      o = li(),
      s = Jf(),
      a = sa(),
      u = Xf(),
      d = Qf(),
      c = Zf(),
      g = ed(),
      h = rd(),
      p = td(),
      v = nd(),
      w = id();
    function y(_ = !1) {
      const m = [
        c.default,
        g.default,
        h.default,
        p.default,
        v.default,
        w.default,
        s.default,
        a.default,
        o.default,
        u.default,
        d.default,
      ];
      return (
        _ ? m.push(r.default, n.default) : m.push(e.default, t.default),
        m.push(i.default),
        m
      );
    }
    return ((Ht.default = y), Ht);
  }
  var an = {},
    qr = {},
    ya;
  function ga() {
    if (ya) return qr;
    ((ya = 1),
      Object.defineProperty(qr, "__esModule", { value: !0 }),
      (qr.dynamicAnchor = void 0));
    const e = te(),
      r = Ve(),
      t = Rt(),
      n = si(),
      i = {
        keyword: "$dynamicAnchor",
        schemaType: "string",
        code: (a) => o(a, a.schema),
      };
    function o(a, u) {
      const { gen: d, it: c } = a;
      c.schemaEnv.root.dynamicAnchors[u] = !0;
      const g = (0, e._)`${r.default.dynamicAnchors}${(0, e.getProperty)(u)}`,
        h = c.errSchemaPath === "#" ? c.validateName : s(a);
      d.if((0, e._)`!${g}`, () => d.assign(g, h));
    }
    qr.dynamicAnchor = o;
    function s(a) {
      const { schemaEnv: u, schema: d, self: c } = a.it,
        { root: g, baseId: h, localRefs: p, meta: v } = u.root,
        { schemaId: w } = c.opts,
        y = new t.SchemaEnv({
          schema: d,
          schemaId: w,
          root: g,
          baseId: h,
          localRefs: p,
          meta: v,
        });
      return (t.compileSchema.call(c, y), (0, n.getValidate)(a, y));
    }
    return ((qr.default = i), qr);
  }
  var Lr = {},
    va;
  function _a() {
    if (va) return Lr;
    ((va = 1),
      Object.defineProperty(Lr, "__esModule", { value: !0 }),
      (Lr.dynamicRef = void 0));
    const e = te(),
      r = Ve(),
      t = si(),
      n = {
        keyword: "$dynamicRef",
        schemaType: "string",
        code: (o) => i(o, o.schema),
      };
    function i(o, s) {
      const { gen: a, keyword: u, it: d } = o;
      if (s[0] !== "#")
        throw new Error(`"${u}" only supports hash fragment reference`);
      const c = s.slice(1);
      if (d.allErrors) g();
      else {
        const p = a.let("valid", !1);
        (g(p), o.ok(p));
      }
      function g(p) {
        if (d.schemaEnv.root.dynamicAnchors[c]) {
          const v = a.let(
            "_v",
            (0, e._)`${r.default.dynamicAnchors}${(0, e.getProperty)(c)}`,
          );
          a.if(v, h(v, p), h(d.validateName, p));
        } else h(d.validateName, p)();
      }
      function h(p, v) {
        return v
          ? () =>
              a.block(() => {
                ((0, t.callRef)(o, p), a.let(v, !0));
              })
          : () => (0, t.callRef)(o, p);
      }
    }
    return ((Lr.dynamicRef = i), (Lr.default = n), Lr);
  }
  var cn = {},
    $a;
  function sd() {
    if ($a) return cn;
    (($a = 1), Object.defineProperty(cn, "__esModule", { value: !0 }));
    const e = ga(),
      r = oe(),
      t = {
        keyword: "$recursiveAnchor",
        schemaType: "boolean",
        code(n) {
          n.schema
            ? (0, e.dynamicAnchor)(n, "")
            : (0, r.checkStrictMode)(
                n.it,
                "$recursiveAnchor: false is ignored",
              );
        },
      };
    return ((cn.default = t), cn);
  }
  var ln = {},
    wa;
  function ad() {
    if (wa) return ln;
    ((wa = 1), Object.defineProperty(ln, "__esModule", { value: !0 }));
    const e = _a(),
      r = {
        keyword: "$recursiveRef",
        schemaType: "string",
        code: (t) => (0, e.dynamicRef)(t, t.schema),
      };
    return ((ln.default = r), ln);
  }
  var ba;
  function cd() {
    if (ba) return an;
    ((ba = 1), Object.defineProperty(an, "__esModule", { value: !0 }));
    const e = ga(),
      r = _a(),
      t = sd(),
      n = ad(),
      i = [e.default, r.default, t.default, n.default];
    return ((an.default = i), an);
  }
  var un = {},
    fn = {},
    Ea;
  function ld() {
    if (Ea) return fn;
    ((Ea = 1), Object.defineProperty(fn, "__esModule", { value: !0 }));
    const e = li(),
      r = {
        keyword: "dependentRequired",
        type: "object",
        schemaType: "object",
        error: e.error,
        code: (t) => (0, e.validatePropertyDeps)(t),
      };
    return ((fn.default = r), fn);
  }
  var dn = {},
    Sa;
  function ud() {
    if (Sa) return dn;
    ((Sa = 1), Object.defineProperty(dn, "__esModule", { value: !0 }));
    const e = li(),
      r = {
        keyword: "dependentSchemas",
        type: "object",
        schemaType: "object",
        code: (t) => (0, e.validateSchemaDeps)(t),
      };
    return ((dn.default = r), dn);
  }
  var pn = {},
    Pa;
  function fd() {
    if (Pa) return pn;
    ((Pa = 1), Object.defineProperty(pn, "__esModule", { value: !0 }));
    const e = oe(),
      r = {
        keyword: ["maxContains", "minContains"],
        type: "array",
        schemaType: "number",
        code({ keyword: t, parentSchema: n, it: i }) {
          n.contains === void 0 &&
            (0, e.checkStrictMode)(i, `"${t}" without "contains" is ignored`);
        },
      };
    return ((pn.default = r), pn);
  }
  var Aa;
  function dd() {
    if (Aa) return un;
    ((Aa = 1), Object.defineProperty(un, "__esModule", { value: !0 }));
    const e = ld(),
      r = ud(),
      t = fd(),
      n = [e.default, r.default, t.default];
    return ((un.default = n), un);
  }
  var hn = {},
    mn = {},
    Ia;
  function pd() {
    if (Ia) return mn;
    ((Ia = 1), Object.defineProperty(mn, "__esModule", { value: !0 }));
    const e = te(),
      r = oe(),
      t = Ve(),
      i = {
        keyword: "unevaluatedProperties",
        type: "object",
        schemaType: ["boolean", "object"],
        trackErrors: !0,
        error: {
          message: "must NOT have unevaluated properties",
          params: ({ params: o }) =>
            (0, e._)`{unevaluatedProperty: ${o.unevaluatedProperty}}`,
        },
        code(o) {
          const { gen: s, schema: a, data: u, errsCount: d, it: c } = o;
          if (!d) throw new Error("ajv implementation error");
          const { allErrors: g, props: h } = c;
          (h instanceof e.Name
            ? s.if((0, e._)`${h} !== true`, () =>
                s.forIn("key", u, (y) => s.if(v(h, y), () => p(y))),
              )
            : h !== !0 &&
              s.forIn("key", u, (y) =>
                h === void 0 ? p(y) : s.if(w(h, y), () => p(y)),
              ),
            (c.props = !0),
            o.ok((0, e._)`${d} === ${t.default.errors}`));
          function p(y) {
            if (a === !1) {
              (o.setParams({ unevaluatedProperty: y }),
                o.error(),
                g || s.break());
              return;
            }
            if (!(0, r.alwaysValidSchema)(c, a)) {
              const _ = s.name("valid");
              (o.subschema(
                {
                  keyword: "unevaluatedProperties",
                  dataProp: y,
                  dataPropType: r.Type.Str,
                },
                _,
              ),
                g || s.if((0, e.not)(_), () => s.break()));
            }
          }
          function v(y, _) {
            return (0, e._)`!${y} || !${y}[${_}]`;
          }
          function w(y, _) {
            const m = [];
            for (const $ in y) y[$] === !0 && m.push((0, e._)`${_} !== ${$}`);
            return (0, e.and)(...m);
          }
        },
      };
    return ((mn.default = i), mn);
  }
  var yn = {},
    Ra;
  function hd() {
    if (Ra) return yn;
    ((Ra = 1), Object.defineProperty(yn, "__esModule", { value: !0 }));
    const e = te(),
      r = oe(),
      n = {
        keyword: "unevaluatedItems",
        type: "array",
        schemaType: ["boolean", "object"],
        error: {
          message: ({ params: { len: i } }) =>
            (0, e.str)`must NOT have more than ${i} items`,
          params: ({ params: { len: i } }) => (0, e._)`{limit: ${i}}`,
        },
        code(i) {
          const { gen: o, schema: s, data: a, it: u } = i,
            d = u.items || 0;
          if (d === !0) return;
          const c = o.const("len", (0, e._)`${a}.length`);
          if (s === !1)
            (i.setParams({ len: d }), i.fail((0, e._)`${c} > ${d}`));
          else if (typeof s == "object" && !(0, r.alwaysValidSchema)(u, s)) {
            const h = o.var("valid", (0, e._)`${c} <= ${d}`);
            (o.if((0, e.not)(h), () => g(h, d)), i.ok(h));
          }
          u.items = !0;
          function g(h, p) {
            o.forRange("i", p, c, (v) => {
              (i.subschema(
                {
                  keyword: "unevaluatedItems",
                  dataProp: v,
                  dataPropType: r.Type.Num,
                },
                h,
              ),
                u.allErrors || o.if((0, e.not)(h), () => o.break()));
            });
          }
        },
      };
    return ((yn.default = n), yn);
  }
  var Oa;
  function md() {
    if (Oa) return hn;
    ((Oa = 1), Object.defineProperty(hn, "__esModule", { value: !0 }));
    const e = pd(),
      r = hd(),
      t = [e.default, r.default];
    return ((hn.default = t), hn);
  }
  var gn = {},
    vn = {},
    Na;
  function yd() {
    if (Na) return vn;
    ((Na = 1), Object.defineProperty(vn, "__esModule", { value: !0 }));
    const e = te(),
      t = {
        keyword: "format",
        type: ["number", "string"],
        schemaType: "string",
        $data: !0,
        error: {
          message: ({ schemaCode: n }) => (0, e.str)`must match format "${n}"`,
          params: ({ schemaCode: n }) => (0, e._)`{format: ${n}}`,
        },
        code(n, i) {
          const {
              gen: o,
              data: s,
              $data: a,
              schema: u,
              schemaCode: d,
              it: c,
            } = n,
            { opts: g, errSchemaPath: h, schemaEnv: p, self: v } = c;
          if (!g.validateFormats) return;
          a ? w() : y();
          function w() {
            const _ = o.scopeValue("formats", {
                ref: v.formats,
                code: g.code.formats,
              }),
              m = o.const("fDef", (0, e._)`${_}[${d}]`),
              $ = o.let("fType"),
              P = o.let("format");
            (o.if(
              (0, e._)`typeof ${m} == "object" && !(${m} instanceof RegExp)`,
              () =>
                o
                  .assign($, (0, e._)`${m}.type || "string"`)
                  .assign(P, (0, e._)`${m}.validate`),
              () => o.assign($, (0, e._)`"string"`).assign(P, m),
            ),
              n.fail$data((0, e.or)(b(), A())));
            function b() {
              return g.strictSchema === !1 ? e.nil : (0, e._)`${d} && !${P}`;
            }
            function A() {
              const O = p.$async
                  ? (0, e._)`(${m}.async ? await ${P}(${s}) : ${P}(${s}))`
                  : (0, e._)`${P}(${s})`,
                F = (0,
                e._)`(typeof ${P} == "function" ? ${O} : ${P}.test(${s}))`;
              return (0, e._)`${P} && ${P} !== true && ${$} === ${i} && !${F}`;
            }
          }
          function y() {
            const _ = v.formats[u];
            if (!_) {
              b();
              return;
            }
            if (_ === !0) return;
            const [m, $, P] = A(_);
            m === i && n.pass(O());
            function b() {
              if (g.strictSchema === !1) {
                v.logger.warn(F());
                return;
              }
              throw new Error(F());
              function F() {
                return `unknown format "${u}" ignored in schema at path "${h}"`;
              }
            }
            function A(F) {
              const V =
                  F instanceof RegExp
                    ? (0, e.regexpCode)(F)
                    : g.code.formats
                      ? (0, e._)`${g.code.formats}${(0, e.getProperty)(u)}`
                      : void 0,
                G = o.scopeValue("formats", { key: u, ref: F, code: V });
              return typeof F == "object" && !(F instanceof RegExp)
                ? [F.type || "string", F.validate, (0, e._)`${G}.validate`]
                : ["string", F, G];
            }
            function O() {
              if (typeof _ == "object" && !(_ instanceof RegExp) && _.async) {
                if (!p.$async) throw new Error("async format in sync schema");
                return (0, e._)`await ${P}(${s})`;
              }
              return typeof $ == "function"
                ? (0, e._)`${P}(${s})`
                : (0, e._)`${P}.test(${s})`;
            }
          }
        },
      };
    return ((vn.default = t), vn);
  }
  var xa;
  function gd() {
    if (xa) return gn;
    ((xa = 1), Object.defineProperty(gn, "__esModule", { value: !0 }));
    const r = [yd().default];
    return ((gn.default = r), gn);
  }
  var Pr = {},
    ka;
  function vd() {
    return (
      ka ||
        ((ka = 1),
        Object.defineProperty(Pr, "__esModule", { value: !0 }),
        (Pr.contentVocabulary = Pr.metadataVocabulary = void 0),
        (Pr.metadataVocabulary = [
          "title",
          "description",
          "default",
          "deprecated",
          "readOnly",
          "writeOnly",
          "examples",
        ]),
        (Pr.contentVocabulary = [
          "contentMediaType",
          "contentEncoding",
          "contentSchema",
        ])),
      Pr
    );
  }
  var Ta;
  function _d() {
    if (Ta) return Nt;
    ((Ta = 1), Object.defineProperty(Nt, "__esModule", { value: !0 }));
    const e = Cf(),
      r = Hf(),
      t = od(),
      n = cd(),
      i = dd(),
      o = md(),
      s = gd(),
      a = vd(),
      u = [
        n.default,
        e.default,
        r.default,
        (0, t.default)(!0),
        s.default,
        a.metadataVocabulary,
        a.contentVocabulary,
        i.default,
        o.default,
      ];
    return ((Nt.default = u), Nt);
  }
  var _n = {},
    rt = {},
    Ca;
  function $d() {
    if (Ca) return rt;
    ((Ca = 1),
      Object.defineProperty(rt, "__esModule", { value: !0 }),
      (rt.DiscrError = void 0));
    var e;
    return (
      (function (r) {
        ((r.Tag = "tag"), (r.Mapping = "mapping"));
      })(e || (rt.DiscrError = e = {})),
      rt
    );
  }
  var ja;
  function wd() {
    if (ja) return _n;
    ((ja = 1), Object.defineProperty(_n, "__esModule", { value: !0 }));
    const e = te(),
      r = $d(),
      t = Rt(),
      n = It(),
      i = oe(),
      s = {
        keyword: "discriminator",
        type: "object",
        schemaType: "object",
        error: {
          message: ({ params: { discrError: a, tagName: u } }) =>
            a === r.DiscrError.Tag
              ? `tag "${u}" must be string`
              : `value of tag "${u}" must be in oneOf`,
          params: ({ params: { discrError: a, tag: u, tagName: d } }) =>
            (0, e._)`{error: ${a}, tag: ${d}, tagValue: ${u}}`,
        },
        code(a) {
          const { gen: u, data: d, schema: c, parentSchema: g, it: h } = a,
            { oneOf: p } = g;
          if (!h.opts.discriminator)
            throw new Error("discriminator: requires discriminator option");
          const v = c.propertyName;
          if (typeof v != "string")
            throw new Error("discriminator: requires propertyName");
          if (c.mapping)
            throw new Error("discriminator: mapping is not supported");
          if (!p) throw new Error("discriminator: requires oneOf keyword");
          const w = u.let("valid", !1),
            y = u.const("tag", (0, e._)`${d}${(0, e.getProperty)(v)}`);
          (u.if(
            (0, e._)`typeof ${y} == "string"`,
            () => _(),
            () =>
              a.error(!1, { discrError: r.DiscrError.Tag, tag: y, tagName: v }),
          ),
            a.ok(w));
          function _() {
            const P = $();
            u.if(!1);
            for (const b in P)
              (u.elseIf((0, e._)`${y} === ${b}`), u.assign(w, m(P[b])));
            (u.else(),
              a.error(!1, {
                discrError: r.DiscrError.Mapping,
                tag: y,
                tagName: v,
              }),
              u.endIf());
          }
          function m(P) {
            const b = u.name("valid"),
              A = a.subschema({ keyword: "oneOf", schemaProp: P }, b);
            return (a.mergeEvaluated(A, e.Name), b);
          }
          function $() {
            var P;
            const b = {},
              A = F(g);
            let O = !0;
            for (let L = 0; L < p.length; L++) {
              let W = p[L];
              if (W?.$ref && !(0, i.schemaHasRulesButRef)(W, h.self.RULES)) {
                const J = W.$ref;
                if (
                  ((W = t.resolveRef.call(
                    h.self,
                    h.schemaEnv.root,
                    h.baseId,
                    J,
                  )),
                  W instanceof t.SchemaEnv && (W = W.schema),
                  W === void 0)
                )
                  throw new n.default(h.opts.uriResolver, h.baseId, J);
              }
              const Y =
                (P = W?.properties) === null || P === void 0 ? void 0 : P[v];
              if (typeof Y != "object")
                throw new Error(
                  `discriminator: oneOf subschemas (or referenced schemas) must have "properties/${v}"`,
                );
              ((O = O && (A || F(W))), V(Y, L));
            }
            if (!O) throw new Error(`discriminator: "${v}" must be required`);
            return b;
            function F({ required: L }) {
              return Array.isArray(L) && L.includes(v);
            }
            function V(L, W) {
              if (L.const) G(L.const, W);
              else if (L.enum) for (const Y of L.enum) G(Y, W);
              else
                throw new Error(
                  `discriminator: "properties/${v}" must have "const" or "enum"`,
                );
            }
            function G(L, W) {
              if (typeof L != "string" || L in b)
                throw new Error(
                  `discriminator: "${v}" values must be unique strings`,
                );
              b[L] = W;
            }
          }
        },
      };
    return ((_n.default = s), _n);
  }
  var $n = {};
  const bd = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/schema",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/core": !0,
        "https://json-schema.org/draft/2020-12/vocab/applicator": !0,
        "https://json-schema.org/draft/2020-12/vocab/unevaluated": !0,
        "https://json-schema.org/draft/2020-12/vocab/validation": !0,
        "https://json-schema.org/draft/2020-12/vocab/meta-data": !0,
        "https://json-schema.org/draft/2020-12/vocab/format-annotation": !0,
        "https://json-schema.org/draft/2020-12/vocab/content": !0,
      },
      $dynamicAnchor: "meta",
      title: "Core and Validation specifications meta-schema",
      allOf: [
        { $ref: "meta/core" },
        { $ref: "meta/applicator" },
        { $ref: "meta/unevaluated" },
        { $ref: "meta/validation" },
        { $ref: "meta/meta-data" },
        { $ref: "meta/format-annotation" },
        { $ref: "meta/content" },
      ],
      type: ["object", "boolean"],
      $comment:
        "This meta-schema also defines keywords that have appeared in previous drafts in order to prevent incompatible extensions as they remain in common use.",
      properties: {
        definitions: {
          $comment: '"definitions" has been replaced by "$defs".',
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          deprecated: !0,
          default: {},
        },
        dependencies: {
          $comment:
            '"dependencies" has been split and replaced by "dependentSchemas" and "dependentRequired" in order to serve their differing semantics.',
          type: "object",
          additionalProperties: {
            anyOf: [
              { $dynamicRef: "#meta" },
              { $ref: "meta/validation#/$defs/stringArray" },
            ],
          },
          deprecated: !0,
          default: {},
        },
        $recursiveAnchor: {
          $comment: '"$recursiveAnchor" has been replaced by "$dynamicAnchor".',
          $ref: "meta/core#/$defs/anchorString",
          deprecated: !0,
        },
        $recursiveRef: {
          $comment: '"$recursiveRef" has been replaced by "$dynamicRef".',
          $ref: "meta/core#/$defs/uriReferenceString",
          deprecated: !0,
        },
      },
    },
    Ed = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/applicator",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/applicator": !0,
      },
      $dynamicAnchor: "meta",
      title: "Applicator vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        prefixItems: { $ref: "#/$defs/schemaArray" },
        items: { $dynamicRef: "#meta" },
        contains: { $dynamicRef: "#meta" },
        additionalProperties: { $dynamicRef: "#meta" },
        properties: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          default: {},
        },
        patternProperties: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          propertyNames: { format: "regex" },
          default: {},
        },
        dependentSchemas: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          default: {},
        },
        propertyNames: { $dynamicRef: "#meta" },
        if: { $dynamicRef: "#meta" },
        then: { $dynamicRef: "#meta" },
        else: { $dynamicRef: "#meta" },
        allOf: { $ref: "#/$defs/schemaArray" },
        anyOf: { $ref: "#/$defs/schemaArray" },
        oneOf: { $ref: "#/$defs/schemaArray" },
        not: { $dynamicRef: "#meta" },
      },
      $defs: {
        schemaArray: {
          type: "array",
          minItems: 1,
          items: { $dynamicRef: "#meta" },
        },
      },
    },
    Sd = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/unevaluated",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/unevaluated": !0,
      },
      $dynamicAnchor: "meta",
      title: "Unevaluated applicator vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        unevaluatedItems: { $dynamicRef: "#meta" },
        unevaluatedProperties: { $dynamicRef: "#meta" },
      },
    },
    Pd = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/content",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/content": !0,
      },
      $dynamicAnchor: "meta",
      title: "Content vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        contentEncoding: { type: "string" },
        contentMediaType: { type: "string" },
        contentSchema: { $dynamicRef: "#meta" },
      },
    },
    Ad = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/core",
      $vocabulary: { "https://json-schema.org/draft/2020-12/vocab/core": !0 },
      $dynamicAnchor: "meta",
      title: "Core vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        $id: {
          $ref: "#/$defs/uriReferenceString",
          $comment: "Non-empty fragments not allowed.",
          pattern: "^[^#]*#?$",
        },
        $schema: { $ref: "#/$defs/uriString" },
        $ref: { $ref: "#/$defs/uriReferenceString" },
        $anchor: { $ref: "#/$defs/anchorString" },
        $dynamicRef: { $ref: "#/$defs/uriReferenceString" },
        $dynamicAnchor: { $ref: "#/$defs/anchorString" },
        $vocabulary: {
          type: "object",
          propertyNames: { $ref: "#/$defs/uriString" },
          additionalProperties: { type: "boolean" },
        },
        $comment: { type: "string" },
        $defs: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
        },
      },
      $defs: {
        anchorString: { type: "string", pattern: "^[A-Za-z_][-A-Za-z0-9._]*$" },
        uriString: { type: "string", format: "uri" },
        uriReferenceString: { type: "string", format: "uri-reference" },
      },
    },
    Id = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/format-annotation",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/format-annotation": !0,
      },
      $dynamicAnchor: "meta",
      title: "Format vocabulary meta-schema for annotation results",
      type: ["object", "boolean"],
      properties: { format: { type: "string" } },
    },
    Rd = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/meta-data",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/meta-data": !0,
      },
      $dynamicAnchor: "meta",
      title: "Meta-data vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        default: !0,
        deprecated: { type: "boolean", default: !1 },
        readOnly: { type: "boolean", default: !1 },
        writeOnly: { type: "boolean", default: !1 },
        examples: { type: "array", items: !0 },
      },
    },
    Od = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/validation",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/validation": !0,
      },
      $dynamicAnchor: "meta",
      title: "Validation vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        type: {
          anyOf: [
            { $ref: "#/$defs/simpleTypes" },
            {
              type: "array",
              items: { $ref: "#/$defs/simpleTypes" },
              minItems: 1,
              uniqueItems: !0,
            },
          ],
        },
        const: !0,
        enum: { type: "array", items: !0 },
        multipleOf: { type: "number", exclusiveMinimum: 0 },
        maximum: { type: "number" },
        exclusiveMaximum: { type: "number" },
        minimum: { type: "number" },
        exclusiveMinimum: { type: "number" },
        maxLength: { $ref: "#/$defs/nonNegativeInteger" },
        minLength: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        pattern: { type: "string", format: "regex" },
        maxItems: { $ref: "#/$defs/nonNegativeInteger" },
        minItems: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        uniqueItems: { type: "boolean", default: !1 },
        maxContains: { $ref: "#/$defs/nonNegativeInteger" },
        minContains: { $ref: "#/$defs/nonNegativeInteger", default: 1 },
        maxProperties: { $ref: "#/$defs/nonNegativeInteger" },
        minProperties: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        required: { $ref: "#/$defs/stringArray" },
        dependentRequired: {
          type: "object",
          additionalProperties: { $ref: "#/$defs/stringArray" },
        },
      },
      $defs: {
        nonNegativeInteger: { type: "integer", minimum: 0 },
        nonNegativeIntegerDefault0: {
          $ref: "#/$defs/nonNegativeInteger",
          default: 0,
        },
        simpleTypes: {
          enum: [
            "array",
            "boolean",
            "integer",
            "null",
            "number",
            "object",
            "string",
          ],
        },
        stringArray: {
          type: "array",
          items: { type: "string" },
          uniqueItems: !0,
          default: [],
        },
      },
    };
  var Fa;
  function Nd() {
    if (Fa) return $n;
    ((Fa = 1), Object.defineProperty($n, "__esModule", { value: !0 }));
    const e = bd,
      r = Ed,
      t = Sd,
      n = Pd,
      i = Ad,
      o = Id,
      s = Rd,
      a = Od,
      u = ["/properties"];
    function d(c) {
      return (
        [e, r, t, n, i, g(this, o), s, g(this, a)].forEach((h) =>
          this.addMetaSchema(h, void 0, !1),
        ),
        this
      );
      function g(h, p) {
        return c ? h.$dataMetaSchema(p, u) : p;
      }
    }
    return (($n.default = d), $n);
  }
  var Da;
  function xd() {
    return (
      Da ||
        ((Da = 1),
        (function (e, r) {
          (Object.defineProperty(r, "__esModule", { value: !0 }),
            (r.MissingRefError =
              r.ValidationError =
              r.CodeGen =
              r.Name =
              r.nil =
              r.stringify =
              r.str =
              r._ =
              r.KeywordCxt =
              r.Ajv2020 =
                void 0));
          const t = kf(),
            n = _d(),
            i = wd(),
            o = Nd(),
            s = "https://json-schema.org/draft/2020-12/schema";
          class a extends t.default {
            constructor(p = {}) {
              super({ ...p, dynamicRef: !0, next: !0, unevaluated: !0 });
            }
            _addVocabularies() {
              (super._addVocabularies(),
                n.default.forEach((p) => this.addVocabulary(p)),
                this.opts.discriminator && this.addKeyword(i.default));
            }
            _addDefaultMetaSchema() {
              super._addDefaultMetaSchema();
              const { $data: p, meta: v } = this.opts;
              v &&
                (o.default.call(this, p),
                (this.refs["http://json-schema.org/schema"] = s));
            }
            defaultMeta() {
              return (this.opts.defaultMeta =
                super.defaultMeta() || (this.getSchema(s) ? s : void 0));
            }
          }
          ((r.Ajv2020 = a),
            (e.exports = r = a),
            (e.exports.Ajv2020 = a),
            Object.defineProperty(r, "__esModule", { value: !0 }),
            (r.default = a));
          var u = St();
          Object.defineProperty(r, "KeywordCxt", {
            enumerable: !0,
            get: function () {
              return u.KeywordCxt;
            },
          });
          var d = te();
          (Object.defineProperty(r, "_", {
            enumerable: !0,
            get: function () {
              return d._;
            },
          }),
            Object.defineProperty(r, "str", {
              enumerable: !0,
              get: function () {
                return d.str;
              },
            }),
            Object.defineProperty(r, "stringify", {
              enumerable: !0,
              get: function () {
                return d.stringify;
              },
            }),
            Object.defineProperty(r, "nil", {
              enumerable: !0,
              get: function () {
                return d.nil;
              },
            }),
            Object.defineProperty(r, "Name", {
              enumerable: !0,
              get: function () {
                return d.Name;
              },
            }),
            Object.defineProperty(r, "CodeGen", {
              enumerable: !0,
              get: function () {
                return d.CodeGen;
              },
            }));
          var c = ni();
          Object.defineProperty(r, "ValidationError", {
            enumerable: !0,
            get: function () {
              return c.default;
            },
          });
          var g = It();
          Object.defineProperty(r, "MissingRefError", {
            enumerable: !0,
            get: function () {
              return g.default;
            },
          });
        })(vt, vt.exports)),
      vt.exports
    );
  }
  var kd = xd();
  const Td = ts(kd);
  var wn = { exports: {} },
    ui = {},
    Ma;
  function Cd() {
    return (
      Ma ||
        ((Ma = 1),
        (function (e) {
          (Object.defineProperty(e, "__esModule", { value: !0 }),
            (e.formatNames = e.fastFormats = e.fullFormats = void 0));
          function r(L, W) {
            return { validate: L, compare: W };
          }
          ((e.fullFormats = {
            date: r(o, s),
            time: r(u(!0), d),
            "date-time": r(h(!0), p),
            "iso-time": r(u(), c),
            "iso-date-time": r(h(), v),
            duration:
              /^P(?!$)((\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?|(\d+W)?)$/,
            uri: _,
            "uri-reference":
              /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i,
            "uri-template":
              /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i,
            url: /^(?:https?|ftp):\/\/(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)(?:\.(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)*(?:\.(?:[a-z\u{00a1}-\u{ffff}]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/iu,
            email:
              /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
            hostname:
              /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i,
            ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/,
            ipv6: /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i,
            regex: G,
            uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
            "json-pointer": /^(?:\/(?:[^~/]|~0|~1)*)*$/,
            "json-pointer-uri-fragment":
              /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i,
            "relative-json-pointer":
              /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/,
            byte: $,
            int32: { type: "number", validate: A },
            int64: { type: "number", validate: O },
            float: { type: "number", validate: F },
            double: { type: "number", validate: F },
            password: !0,
            binary: !0,
          }),
            (e.fastFormats = {
              ...e.fullFormats,
              date: r(/^\d\d\d\d-[0-1]\d-[0-3]\d$/, s),
              time: r(
                /^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i,
                d,
              ),
              "date-time": r(
                /^\d\d\d\d-[0-1]\d-[0-3]\dt(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i,
                p,
              ),
              "iso-time": r(
                /^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i,
                c,
              ),
              "iso-date-time": r(
                /^\d\d\d\d-[0-1]\d-[0-3]\d[t\s](?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i,
                v,
              ),
              uri: /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/)?[^\s]*$/i,
              "uri-reference":
                /^(?:(?:[a-z][a-z0-9+\-.]*:)?\/?\/)?(?:[^\\\s#][^\s#]*)?(?:#[^\\\s]*)?$/i,
              email:
                /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i,
            }),
            (e.formatNames = Object.keys(e.fullFormats)));
          function t(L) {
            return L % 4 === 0 && (L % 100 !== 0 || L % 400 === 0);
          }
          const n = /^(\d\d\d\d)-(\d\d)-(\d\d)$/,
            i = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
          function o(L) {
            const W = n.exec(L);
            if (!W) return !1;
            const Y = +W[1],
              J = +W[2],
              le = +W[3];
            return (
              J >= 1 &&
              J <= 12 &&
              le >= 1 &&
              le <= (J === 2 && t(Y) ? 29 : i[J])
            );
          }
          function s(L, W) {
            if (L && W) return L > W ? 1 : L < W ? -1 : 0;
          }
          const a =
            /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)?$/i;
          function u(L) {
            return function (Y) {
              const J = a.exec(Y);
              if (!J) return !1;
              const le = +J[1],
                Ie = +J[2],
                be = +J[3],
                ue = J[4],
                De = J[5] === "-" ? -1 : 1,
                z = +(J[6] || 0),
                k = +(J[7] || 0);
              if (z > 23 || k > 59 || (L && !ue)) return !1;
              if (le <= 23 && Ie <= 59 && be < 60) return !0;
              const U = Ie - k * De,
                C = le - z * De - (U < 0 ? 1 : 0);
              return (
                (C === 23 || C === -1) && (U === 59 || U === -1) && be < 61
              );
            };
          }
          function d(L, W) {
            if (!(L && W)) return;
            const Y = new Date("2020-01-01T" + L).valueOf(),
              J = new Date("2020-01-01T" + W).valueOf();
            if (Y && J) return Y - J;
          }
          function c(L, W) {
            if (!(L && W)) return;
            const Y = a.exec(L),
              J = a.exec(W);
            if (Y && J)
              return (
                (L = Y[1] + Y[2] + Y[3]),
                (W = J[1] + J[2] + J[3]),
                L > W ? 1 : L < W ? -1 : 0
              );
          }
          const g = /t|\s/i;
          function h(L) {
            const W = u(L);
            return function (J) {
              const le = J.split(g);
              return le.length === 2 && o(le[0]) && W(le[1]);
            };
          }
          function p(L, W) {
            if (!(L && W)) return;
            const Y = new Date(L).valueOf(),
              J = new Date(W).valueOf();
            if (Y && J) return Y - J;
          }
          function v(L, W) {
            if (!(L && W)) return;
            const [Y, J] = L.split(g),
              [le, Ie] = W.split(g),
              be = s(Y, le);
            if (be !== void 0) return be || d(J, Ie);
          }
          const w = /\/|:/,
            y =
              /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
          function _(L) {
            return w.test(L) && y.test(L);
          }
          const m =
            /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/gm;
          function $(L) {
            return ((m.lastIndex = 0), m.test(L));
          }
          const P = -2147483648,
            b = 2 ** 31 - 1;
          function A(L) {
            return Number.isInteger(L) && L <= b && L >= P;
          }
          function O(L) {
            return Number.isInteger(L);
          }
          function F() {
            return !0;
          }
          const V = /[^\\]\\Z/;
          function G(L) {
            if (V.test(L)) return !1;
            try {
              return (new RegExp(L), !0);
            } catch {
              return !1;
            }
          }
        })(ui)),
      ui
    );
  }
  var fi = {},
    qa;
  function jd() {
    return (
      qa ||
        ((qa = 1),
        (function (e) {
          (Object.defineProperty(e, "__esModule", { value: !0 }),
            (e.formatLimitDefinition = void 0));
          const r = zr,
            t = te(),
            n = t.operators,
            i = {
              formatMaximum: { okStr: "<=", ok: n.LTE, fail: n.GT },
              formatMinimum: { okStr: ">=", ok: n.GTE, fail: n.LT },
              formatExclusiveMaximum: { okStr: "<", ok: n.LT, fail: n.GTE },
              formatExclusiveMinimum: { okStr: ">", ok: n.GT, fail: n.LTE },
            },
            o = {
              message: ({ keyword: a, schemaCode: u }) =>
                (0, t.str)`should be ${i[a].okStr} ${u}`,
              params: ({ keyword: a, schemaCode: u }) =>
                (0, t._)`{comparison: ${i[a].okStr}, limit: ${u}}`,
            };
          e.formatLimitDefinition = {
            keyword: Object.keys(i),
            type: "string",
            schemaType: "string",
            $data: !0,
            error: o,
            code(a) {
              const { gen: u, data: d, schemaCode: c, keyword: g, it: h } = a,
                { opts: p, self: v } = h;
              if (!p.validateFormats) return;
              const w = new r.KeywordCxt(
                h,
                v.RULES.all.format.definition,
                "format",
              );
              w.$data ? y() : _();
              function y() {
                const $ = u.scopeValue("formats", {
                    ref: v.formats,
                    code: p.code.formats,
                  }),
                  P = u.const("fmt", (0, t._)`${$}[${w.schemaCode}]`);
                a.fail$data(
                  (0, t.or)(
                    (0, t._)`typeof ${P} != "object"`,
                    (0, t._)`${P} instanceof RegExp`,
                    (0, t._)`typeof ${P}.compare != "function"`,
                    m(P),
                  ),
                );
              }
              function _() {
                const $ = w.schema,
                  P = v.formats[$];
                if (!P || P === !0) return;
                if (
                  typeof P != "object" ||
                  P instanceof RegExp ||
                  typeof P.compare != "function"
                )
                  throw new Error(
                    `"${g}": format "${$}" does not define "compare" function`,
                  );
                const b = u.scopeValue("formats", {
                  key: $,
                  ref: P,
                  code: p.code.formats
                    ? (0, t._)`${p.code.formats}${(0, t.getProperty)($)}`
                    : void 0,
                });
                a.fail$data(m(b));
              }
              function m($) {
                return (0, t._)`${$}.compare(${d}, ${c}) ${i[g].fail} 0`;
              }
            },
            dependencies: ["format"],
          };
          const s = (a) => (a.addKeyword(e.formatLimitDefinition), a);
          e.default = s;
        })(fi)),
      fi
    );
  }
  var La;
  function Fd() {
    return (
      La ||
        ((La = 1),
        (function (e, r) {
          Object.defineProperty(r, "__esModule", { value: !0 });
          const t = Cd(),
            n = jd(),
            i = te(),
            o = new i.Name("fullFormats"),
            s = new i.Name("fastFormats"),
            a = (d, c = { keywords: !0 }) => {
              if (Array.isArray(c)) return (u(d, c, t.fullFormats, o), d);
              const [g, h] =
                  c.mode === "fast" ? [t.fastFormats, s] : [t.fullFormats, o],
                p = c.formats || t.formatNames;
              return (u(d, p, g, h), c.keywords && (0, n.default)(d), d);
            };
          a.get = (d, c = "full") => {
            const h = (c === "fast" ? t.fastFormats : t.fullFormats)[d];
            if (!h) throw new Error(`Unknown format "${d}"`);
            return h;
          };
          function u(d, c, g, h) {
            var p, v;
            ((p = (v = d.opts.code).formats) !== null && p !== void 0) ||
              (v.formats = (0, i._)`require("ajv-formats/dist/formats").${h}`);
            for (const w of c) d.addFormat(w, g[w]);
          }
          ((e.exports = r = a),
            Object.defineProperty(r, "__esModule", { value: !0 }),
            (r.default = a));
        })(wn, wn.exports)),
      wn.exports
    );
  }
  var Dd = Fd();
  const Md = ts(Dd);
  let mr,
    bn = null;
  function qd(e) {
    ((mr = new Td({ allErrors: !0, strict: !1 })),
      Md(mr),
      mr.addFormat("uint", {
        type: "number",
        validate: (r) => r >= 0 && Number.isInteger(r),
      }),
      mr.addFormat("uint8", {
        type: "number",
        validate: (r) => r >= 0 && r <= 255 && Number.isInteger(r),
      }),
      mr.addFormat("uint16", {
        type: "number",
        validate: (r) => r >= 0 && r <= 65535 && Number.isInteger(r),
      }),
      mr.addFormat("uint32", {
        type: "number",
        validate: (r) => r >= 0 && r <= 4294967295 && Number.isInteger(r),
      }),
      mr.addFormat("uint64", {
        type: "number",
        validate: (r) => {
          try {
            const t = BigInt(r);
            return t >= 0n && t <= 18446744073709551615n;
          } catch {
            return !1;
          }
        },
      }));
    try {
      bn = mr.compile(e);
    } catch (r) {
      throw (console.error("AJV Compilation Error:", r), r);
    }
  }
  function Ld(e) {
    return !bn || bn(e) ? null : bn.errors || null;
  }
  async function Bd(e) {
    try {
      const r = new br(),
        t = typeof e == "object" ? JSON.parse(JSON.stringify(e)) : e,
        n = await r.parse(e),
        i = typeof n == "object" ? n.$ref : void 0,
        o =
          typeof n == "object" &&
          n.additionalProperties &&
          typeof n.additionalProperties == "object" &&
          "$ref" in n.additionalProperties
            ? n.additionalProperties.$ref
            : void 0,
        s = await r.dereference(e);
      let a = s;
      if (i && i.startsWith("#/") && typeof a == "object") {
        const c = i.substring(2).split("/");
        let g = s;
        for (const h of c) g = g?.[h];
        g && (a = { ...s, ...g });
      }
      if (o && o.startsWith("#/") && typeof a == "object") {
        const c = o.substring(2).split("/");
        let g = s;
        for (const h of c) g = g?.[h];
        if (g) {
          const h = a,
            p =
              typeof h.additionalProperties == "object"
                ? h.additionalProperties
                : {};
          h.additionalProperties = { ...p, ...g };
        }
      }
      const d = await new br().bundle(t);
      return (qd(d), Br(a));
    } catch (r) {
      throw (console.error("Error parsing schema:", r), r);
    }
  }
  function Br(e, r = "", t = 0, n = !1) {
    if (t > 16)
      return {
        type: "string",
        title: r || "Max Depth Reached",
        description: "Maximum recursion depth exceeded.",
      };
    if (typeof e == "boolean") return { type: "boolean", title: r };
    let i = e;
    if (i.allOf) {
      const h = di(i);
      if (typeof h == "boolean") return { type: "boolean", title: r };
      i = h;
    }
    let o = i.type;
    o
      ? Array.isArray(o) && (o = o[0])
      : i.properties || i.additionalProperties || i.oneOf || i.anyOf
        ? (o = "object")
        : (o = Array.isArray(i.type) ? i.type[0] : "string");
    const s = r ? Ba(r) : "",
      a = i.title,
      u = a !== void 0 ? a : s,
      c = {
        key: r || void 0,
        type: o,
        title: Zo(u || "", u),
        description: wf(r, i.description || void 0),
        defaultValue: i.default,
        enum: i.enum,
        required: n,
        minLength: i.minLength,
        maxLength: i.maxLength,
        minimum: i.minimum,
        maximum: i.maximum,
        pattern: i.pattern,
        format: i.format,
        readOnly: i.readOnly,
      },
      g = i.oneOf || i.anyOf;
    if (
      (g &&
        (c.oneOf = g.map((h, p) => {
          let v = di(h);
          const w = Ud(v, p),
            y = Ba(w),
            _ = Br(v, "", t + 1, n);
          return (
            (!_.title || _.title.startsWith("Option ")) && (_.title = y),
            _
          );
        })),
      c.type === "object")
    ) {
      if (i.properties) {
        c.properties = {};
        for (const h in i.properties) {
          const p = i.properties[h],
            v = i.required?.includes(h) || !1;
          let w = p;
          if (c.title && h.toLowerCase() === c.title.toLowerCase()) {
            const y = p;
            (y.type === "object" ||
              y.type === "array" ||
              y.properties ||
              y.items ||
              y.oneOf ||
              y.anyOf) &&
              ((w = { ...y }), (w.title = ""));
          }
          c.properties[h] = Br(w, h, t + 1, v);
        }
      }
      i.additionalProperties !== void 0 &&
        (typeof i.additionalProperties == "boolean"
          ? (c.additionalProperties = i.additionalProperties)
          : (c.additionalProperties = Br(
              i.additionalProperties,
              "Additional Property",
              t + 1,
              !1,
            )));
    }
    return (
      c.type === "array" &&
        (i.items &&
          typeof i.items == "object" &&
          !Array.isArray(i.items) &&
          (c.items = Br(i.items, "", t + 1, !1)),
        i.prefixItems &&
          Array.isArray(i.prefixItems) &&
          (c.prefixItems = i.prefixItems.map((h) => Br(h, "", t + 1, !1)))),
      c
    );
  }
  function En(e) {
    if (typeof e == "boolean") return;
    const r = e;
    if (r.const !== void 0) return String(r.const);
    if (Array.isArray(r.enum) && r.enum.length === 1) return String(r.enum[0]);
    if (r.allOf)
      for (const t of r.allOf) {
        const n = En(t);
        if (n) return n;
      }
  }
  function Ud(e, r) {
    if (typeof e == "boolean") return `Option ${r + 1}`;
    const t = e;
    if (t.title) return t.title;
    const n = En(t);
    if (n) return n;
    if (t.properties) {
      const o = Object.keys(t.properties);
      if (o.length === 1) return o[0];
    }
    const i = or.parser.titleCandidates;
    for (const o of i)
      if (t.properties?.[o]) {
        const s = t.properties[o],
          a = En(s);
        if (a) return a;
        if (typeof s == "object" && s.default !== void 0)
          return String(s.default);
      }
    if (t.properties)
      for (const o in t.properties) {
        const s = En(t.properties[o]);
        if (s && s.length < 50) return s;
      }
    return `Option ${r + 1}`;
  }
  function di(e) {
    if (typeof e == "boolean") return e;
    const r = e,
      { allOf: t, ...n } = r,
      i = { ...n };
    return t
      ? (t.forEach((o) => {
          const s = di(o);
          typeof s != "boolean" &&
            (!i.title && s.title && (i.title = s.title),
            s.type && !i.type && (i.type = s.type),
            s.properties &&
              (i.properties = { ...i.properties, ...s.properties }),
            s.required && (i.required = [...(i.required || []), ...s.required]),
            s.additionalProperties !== void 0 &&
              (i.additionalProperties = s.additionalProperties),
            s.oneOf && (i.oneOf = s.oneOf),
            s.anyOf && (i.anyOf = s.anyOf),
            s.minLength !== void 0 && (i.minLength = s.minLength),
            s.maxLength !== void 0 && (i.maxLength = s.maxLength),
            s.minimum !== void 0 && (i.minimum = s.minimum),
            s.maximum !== void 0 && (i.maximum = s.maximum),
            s.pattern !== void 0 && (i.pattern = s.pattern),
            s.enum !== void 0 && (i.enum = s.enum),
            s.format !== void 0 && (i.format = s.format));
        }),
        i)
      : r;
  }
  function Ba(e) {
    if (!e) return "";
    const r = Zo(e, "");
    return (
      r ||
      e
        .replace(/[-_]/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\b\w/g, (t) => t.toUpperCase())
    );
  }
  function He(e) {
    if (e.defaultValue !== void 0) return e.defaultValue;
    if (e.type === "object") {
      const r = {};
      if (e.properties)
        for (const t in e.properties) {
          const n = e.properties[t];
          if (
            n.required ||
            n.defaultValue !== void 0 ||
            n.type === "object" ||
            n.type === "array"
          ) {
            const o = He(n);
            o !== void 0 && (r[t] = o);
          }
        }
      if (e.oneOf && e.oneOf.length > 0) {
        let t = e.oneOf.findIndex((i) => i.type === "null");
        (t === -1 &&
          (t = e.oneOf.findIndex((i) => {
            const o = i.title ? i.title.toLowerCase() : "";
            return o === "null" || o === "none";
          })),
          t === -1 && (t = 0));
        const n = He(e.oneOf[t]);
        n !== void 0 &&
          typeof n == "object" &&
          n !== null &&
          Object.assign(r, n);
      }
      return r;
    }
    if (e.type === "array")
      return e.prefixItems && e.prefixItems.length > 0
        ? e.prefixItems.map((r) => He(r))
        : [];
    if (e.enum && e.enum.length > 0) return e.enum[0];
    switch (e.type) {
      case "string":
        return "";
      case "number":
      case "integer":
        return 0;
      case "boolean":
        return !1;
      case "null":
        return null;
      default:
        return;
    }
  }
  function K(e, r, ...t) {
    const n = document.createElement(e);
    for (const i in r)
      if (i === "dangerouslySetInnerHTML") {
        const o = r[i];
        o && typeof o == "object" && typeof o.__html == "string"
          ? (n.innerHTML = o.__html)
          : console.warn(
              `[hyperscript] Invalid dangerouslySetInnerHTML passed to <${e}>. Expected { __html: string }.`,
            );
      } else if (i.startsWith("on") && typeof r[i] == "function")
        n.addEventListener(i.substring(2).toLowerCase(), r[i]);
      else if (i === "className") n.setAttribute("class", r[i]);
      else {
        const o = r[i];
        o != null && n.setAttribute(i, String(o));
      }
    for (const i of t)
      typeof i == "string" || typeof i == "number"
        ? n.appendChild(document.createTextNode(String(i)))
        : i && n.appendChild(i);
    return n;
  }
  const D = {
      elements: {
        input: "input",
        select: "select",
        label: "label",
        fieldset: "fieldset",
        legend: "legend",
        formItem: "div",
        additionalProperties: "div",
        array: "div",
        arrayItem: "div",
        oneOf: "div",
        additionalPropertyItem: "div",
      },
      triggers: {
        oneOfSelector: "js-oneof-selector",
        addArrayItem: "js-btn-add-array-item",
        removeArrayItem: "js-btn-remove-item",
        addAdditionalProperty: "js-btn-add-ap",
        removeAdditionalProperty: "js-btn-remove-ap",
        additionalPropertyKey: "js-ap-key",
        additionalPropertyItems: "js-ap-items",
        additionalPropertyRow: "js-ap-row",
        additionalPropertiesWrapper: "js-additional-properties",
        arrayItems: "js-array-items",
        arrayItemRow: "js-array-item-row",
        arrayItemContent: "js-array-item-content",
        apKeyContainer: "js-ap-key-container",
        apValueWrapper: "js-ap-value-wrapper",
        validationError: "js-validation-error",
      },
      classes: {
        input: "form-control",
        inputSmall: "form-control form-control-sm",
        select: "form-select",
        label: "form-label",
        labelSmall: "form-label small",
        invalid: "is-invalid",
        fieldWrapper: "mb-3",
        fieldset: "border p-3 rounded mb-3",
        legend: "h6",
        description: "form-text",
        checkboxWrapper: "mb-3 form-check",
        checkboxInput: "form-check-input",
        checkboxLabel: "form-check-label",
        buttonPrimary: "btn btn-sm btn-outline-primary mt-2",
        buttonSecondary: "btn btn-sm btn-outline-secondary mt-2",
        buttonDanger: "btn btn-sm btn-outline-danger",
        textDanger: "text-danger",
        textMuted: "text-muted fst-italic",
        alertDanger: "alert alert-danger",
        alertWarning: "alert alert-warning",
        oneOfSelector: "form-select mb-2 oneof-selector",
        oneOfWrapper: "mt-3 border-top pt-3",
        oneOfContainer: "oneof-container ps-3 border-start",
        additionalProperties: "additional-properties mt-3 border-top pt-2",
        additionalPropertiesItems: "ap-items",
        additionalPropertyItem: "ap-row gap-2 mb-2 align-items-end",
        arrayItems: "array-items",
        arrayItemRow: "array-item-row gap-2 mb-2 align-items-start",
        arrayItemContent: "flex-grow-1",
        error: "invalid-feedback d-block",
        layoutGroup: "layout-group mb-3",
        layoutGroupLabel: "d-block fw-bold",
        layoutGroupContent: "d-flex gap-3",
        headless: "headless-object",
        apKeyContainer: "ap-key-container",
        apValueWrapper: "flex-grow-1 ap-value-wrapper",
        objectWrapper: "ui_obj",
        arrayWrapper: "ui_arr",
        nullWrapper: "ui_null",
        compactRow: "row mb-2",
        compactLabel: "col-sm-3 col-form-label small",
        compactContent: "col-sm-9",
        compactDescriptionWrapper: "small text-muted",
        compactErrorPlaceholder: "col-12",
      },
    },
    Vd = (e, r, t, n) => {
      const i = e._inputId || r,
        o = e.title
          ? K(
              "label",
              { className: D.classes.compactLabel, for: i },
              e.title,
              e.required
                ? K("span", { className: D.classes.textDanger }, "*")
                : "",
            )
          : null,
        s = e.description
          ? K("span", { className: D.classes.description }, e.description)
          : null,
        a = K("div", { "data-validation-for": r });
      return K(
        "div",
        { className: n || D.classes.compactRow, "data-element-id": r },
        o || "",
        K(
          "div",
          { className: D.classes.compactContent },
          t,
          K("div", { className: D.classes.compactDescriptionWrapper }, s || ""),
        ),
        K("div", { className: D.classes.compactErrorPlaceholder }, a),
      );
    },
    ne = {
      renderFieldWrapper: (e, r, t, n) => {
        const i = [],
          o = e._inputId || r;
        return (
          e.title &&
            i.push(
              K(
                D.elements.label,
                { className: D.classes.label, for: o },
                e.title,
                e.required
                  ? K("span", { className: D.classes.textDanger }, "*")
                  : "",
              ),
            ),
          i.push(t),
          e.description &&
            i.push(
              K("div", { className: D.classes.description }, e.description),
            ),
          i.push(K("div", { "data-validation-for": r })),
          K(
            D.elements.formItem,
            { className: n || D.classes.fieldWrapper, "data-element-id": r },
            ...i,
          )
        );
      },
      renderString: (e, r, t) => {
        const n = { type: "text", className: D.classes.input, id: r, name: t };
        if (
          (e.defaultValue !== void 0 && (n.value = e.defaultValue),
          e.required && (n.required = !0),
          e.pattern && (n.pattern = e.pattern),
          e.minLength !== void 0 && (n.minlength = e.minLength),
          e.maxLength !== void 0 && (n.maxlength = e.maxLength),
          e.readOnly && (n.disabled = !0),
          e.format)
        )
          switch (e.format) {
            case "email":
              n.type = "email";
              break;
            case "uri":
              n.type = "url";
              break;
            case "date":
              n.type = "date";
              break;
            case "time":
              n.type = "time";
              break;
            case "date-time":
              n.type = "datetime-local";
              break;
          }
        const i = K(D.elements.input, n);
        return ne.renderFieldWrapper(e, r, i);
      },
      renderFieldsetWrapper: (e, r, t, n = "") => {
        const i = [
          K(D.elements.legend, { className: D.classes.legend }, e.title),
        ];
        return (
          e.description &&
            i.push(
              K("div", { className: D.classes.description }, e.description),
            ),
          i.push(t),
          i.push(K("div", { "data-validation-for": r })),
          K(
            D.elements.fieldset,
            { className: `${D.classes.fieldset} ${n}`, id: r },
            ...i,
          )
        );
      },
      renderNumber: (e, r, t) => {
        const n = {
          type: "number",
          className: D.classes.input,
          id: r,
          name: t,
        };
        (e.defaultValue !== void 0 && (n.value = e.defaultValue),
          e.required && (n.required = !0),
          e.minimum !== void 0 && (n.min = e.minimum),
          e.maximum !== void 0 && (n.max = e.maximum),
          e.readOnly && (n.disabled = !0));
        const i = K(D.elements.input, n);
        return ne.renderFieldWrapper(e, r, i);
      },
      renderBoolean: (e, r, t, n = "") => {
        const i = {
          type: "checkbox",
          className: D.classes.checkboxInput,
          id: r,
          name: t,
        };
        if (
          (e.defaultValue && (i.checked = !0),
          e.required && (i.required = !0),
          e.readOnly && (i.disabled = !0),
          n)
        ) {
          const s = n.match(/data-toggle-target="([^"]+)"/);
          s && (i["data-toggle-target"] = s[1]);
        }
        const o = [
          K(D.elements.input, i),
          K(
            D.elements.label,
            { className: D.classes.checkboxLabel, for: r },
            e.title,
            e.required
              ? K("span", { className: D.classes.textDanger }, "*")
              : "",
          ),
        ];
        return (
          e.description &&
            o.push(
              K("div", { className: D.classes.description }, e.description),
            ),
          o.push(K("div", { "data-validation-for": r })),
          K("div", { className: D.classes.checkboxWrapper }, ...o)
        );
      },
      renderSelect: (e, r, t = [], n) => {
        const i = t.map((a) => {
            const u = { value: a };
            return (
              String(e.defaultValue) === a && (u.selected = !0),
              K("option", u, a)
            );
          }),
          o = { className: D.classes.select, id: r, name: n };
        (e.required && (o.required = !0), e.readOnly && (o.disabled = !0));
        const s = K(D.elements.select, o, ...i);
        return ne.renderFieldWrapper(e, r, s);
      },
      renderObject: (e, r, t) => {
        if (e.oneOf && e.oneOf.length > 0)
          return ne.renderFieldsetWrapper(e, r, t, D.classes.objectWrapper);
        const n = [];
        return (
          e.title && n.push(K("h6", { className: "fw-bold" }, e.title)),
          e.description &&
            n.push(
              K("div", { className: D.classes.description }, e.description),
            ),
          n.push(t),
          n.push(K("div", { "data-validation-for": r })),
          K(
            "div",
            {
              className: `${D.classes.objectWrapper}`,
              id: r,
              "data-element-id": r,
            },
            ...n,
          )
        );
      },
      renderAdditionalProperties: (e, r, t) => {
        if (!e.additionalProperties) return document.createTextNode("");
        const n = [],
          i = t?.title ?? pr("additional_properties", "Additional Properties");
        (t?.title !== null && i && n.push(K("h6", {}, i)),
          n.push(
            K("div", {
              className: `${D.classes.additionalPropertiesItems} ${D.triggers.additionalPropertyItems}`,
            }),
          ));
        const o = {
          className: `${D.classes.buttonSecondary} ${D.triggers.addAdditionalProperty}`,
          type: "button",
          "data-id": r,
        };
        return (
          t?.keyPattern && (o["data-key-pattern"] = t.keyPattern),
          n.push(K("button", o, pr("add_property", "Add Property"))),
          K(
            D.elements.additionalProperties,
            {
              className: `${D.classes.additionalProperties} ${D.triggers.additionalPropertiesWrapper}`,
              "data-element-id": r,
            },
            ...n,
          )
        );
      },
      renderOneOf: (e, r, t) => {
        if (!e.oneOf || e.oneOf.length === 0)
          return document.createTextNode("");
        let n = -1;
        (e.defaultValue !== void 0 &&
          (n = e.oneOf.findIndex((d) => {
            if (e.defaultValue === null)
              return (
                d.type === "null" ||
                (d.title && d.title.toLowerCase() === "null")
              );
            if (Array.isArray(e.defaultValue)) return d.type === "array";
            if (typeof e.defaultValue == "object") {
              if (d.properties) {
                const c = Object.keys(e.defaultValue),
                  g = Object.keys(d.properties);
                if (
                  (g.length === 1 && c.includes(g[0])) ||
                  (Array.isArray(d.required) &&
                    d.required.length > 0 &&
                    d.required.every((h) => c.includes(h)))
                )
                  return !0;
              }
              return !1;
            }
            return (
              d.type === typeof e.defaultValue ||
              (d.type === "integer" && typeof e.defaultValue == "number")
            );
          })),
          n === -1 &&
            ((n = e.oneOf.findIndex((d) => d.type === "null")),
            n === -1 &&
              (n = e.oneOf.findIndex((d) => {
                const c = (d.title || "").toLowerCase();
                return c === "null" || c === "none";
              })),
            n === -1 && (n = 0)));
        const i = e.oneOf.map((d, c) => {
            const g = { value: c };
            return (c === n && (g.selected = !0), K("option", g, d.title));
          }),
          o = K(
            "select",
            {
              className: `${D.classes.oneOfSelector} ${D.triggers.oneOfSelector}`,
              id: `${r}__selector`,
              "data-id": r,
              name: t,
            },
            ...i,
          ),
          s = K("div", {
            className: D.classes.oneOfContainer,
            id: `${r}__oneof_content`,
          }),
          a = K(D.elements.oneOf, { "data-element-id": r }, o, s),
          u = {
            ...e,
            title: pr("type_variant", "Type / Variant"),
            description: void 0,
            required: !1,
            _inputId: `${r}__selector`,
          };
        return ne.renderFieldWrapper(u, r, a, D.classes.oneOfWrapper);
      },
      renderArray: (e, r, t) => {
        const i = [
          K("div", {
            className: `${D.classes.arrayItems} ${D.triggers.arrayItems}`,
            id: `${r}-items`,
          }),
        ];
        if (!t?.isFixedSize) {
          const s = K(
            "button",
            {
              className: `${D.classes.buttonPrimary} ${D.triggers.addArrayItem}`,
              type: "button",
              "data-id": r,
              "data-target": `${r}-items`,
            },
            pr("add_item", "Add Item"),
          );
          i.push(s);
        }
        const o = K(D.elements.array, { "data-element-id": r }, ...i);
        return ne.renderFieldsetWrapper(e, r, o, D.classes.arrayWrapper);
      },
      renderArrayItem: (e, r) => {
        const t = r?.isRemovable !== !1,
          i = [
            K(
              "div",
              {
                className: `${D.classes.arrayItemContent} ${D.triggers.arrayItemContent}`,
              },
              e,
            ),
          ];
        if (t) {
          const o = K(
            "button",
            {
              className: `${D.classes.buttonDanger} ${D.triggers.removeArrayItem}`,
              type: "button",
            },
            pr("remove", "Remove"),
          );
          i.push(o);
        }
        return K(
          D.elements.arrayItem,
          { className: `${D.classes.arrayItemRow} ${D.triggers.arrayItemRow}` },
          ...i,
        );
      },
      renderAdditionalPropertyRow: (e, r = "", t = "") => {
        const n = K(
            "label",
            { className: D.classes.labelSmall, for: t },
            "Key",
          ),
          i = K("input", {
            type: "text",
            className: `${D.classes.inputSmall} ${D.triggers.additionalPropertyKey}`,
            placeholder: "Key",
            value: r,
            "data-original-key": r,
            id: t,
          }),
          o = K(
            "div",
            {
              className: `${D.classes.apKeyContainer} ${D.triggers.apKeyContainer}`,
            },
            n,
            i,
          ),
          s = K(
            "div",
            {
              className: `${D.classes.apValueWrapper} ${D.triggers.apValueWrapper}`,
            },
            e,
          ),
          a = K(
            "button",
            {
              className: `${D.classes.buttonDanger} ${D.triggers.removeAdditionalProperty}`,
              type: "button",
            },
            pr("remove_property", "X"),
          );
        return K(
          D.elements.additionalPropertyItem,
          {
            className: `${D.classes.additionalPropertyItem} ${D.triggers.additionalPropertyRow}`,
          },
          o,
          s,
          a,
        );
      },
      renderLayoutGroup: (e, r, t = D.classes.layoutGroupContent) => {
        const n = [];
        return (
          e &&
            n.push(
              K(
                "label",
                {
                  className: `${D.classes.label} ${D.classes.layoutGroupLabel}`,
                },
                e,
              ),
            ),
          n.push(K("div", { className: t }, r)),
          K("div", { className: D.classes.layoutGroup }, ...n)
        );
      },
      renderFormWrapper: (e) => {
        const r = K("div", { id: "form-global-errors", "aria-live": "polite" });
        return K("form", { id: "generated-form" }, r, e);
      },
      renderNull: (e) =>
        K(
          "div",
          { className: `${D.classes.nullWrapper} ${D.classes.textMuted}` },
          "null",
        ),
      renderUnsupported: (e) =>
        K(
          "div",
          { className: D.classes.alertWarning },
          `${pr("unsupported_type", "Unsupported type")}: ${e.type}`,
        ),
      renderHeadlessObject: (e, r) =>
        K("div", { id: e, className: D.classes.headless }, r),
      renderSchemaError: (e) =>
        K(
          "div",
          { className: D.classes.alertDanger },
          K(
            "strong",
            {},
            pr(
              "error_schema_load",
              "Error: Could not load or parse the schema.",
            ),
          ),
          K("br", {}),
          K("small", {}, String(e)),
        ),
      renderFragment: (e) => {
        const r = document.createDocumentFragment();
        for (const t of e) r.appendChild(t);
        return r;
      },
    };
  function zd(e, r) {
    (Kd(r), Hd(e, r), Yd(e, r), Xd(e, r));
  }
  function Kd(e) {
    (e.addEventListener("change", (r) => {
      const t = r.target;
      if (t.hasAttribute("data-toggle-target")) {
        const n = t.getAttribute("data-toggle-target"),
          i = document.getElementById(n);
        if (i) {
          const s = t.checked;
          i.style.display = s ? "block" : "none";
        }
      }
    }),
      e
        .querySelectorAll("[data-toggle-target]")
        .forEach((r) => r.dispatchEvent(new Event("change", { bubbles: !0 }))));
  }
  function Hd(e, r) {
    (r.querySelectorAll(`.${D.triggers.additionalPropertyKey}`).forEach((t) => {
      const n = t;
      n.setAttribute("data-original-key", n.value);
    }),
      r.addEventListener("input", (t) => {
        const n = t.target;
        n.id &&
          (n.id.endsWith("__selector") ||
            (n.classList.contains(D.triggers.additionalPropertyKey)
              ? Wd(e, n)
              : Gd(e, n),
            Ur(e)));
      }));
  }
  function Wd(e, r) {
    const t = r.getAttribute("data-original-key"),
      n = r.value;
    if (t !== n) {
      const i = r.id.match(/(.*)\.__ap_(\d+)_key$/);
      if (i) {
        const o = i[1],
          s = i[2],
          a = yr(e, o);
        if (a) {
          const u = e.store.getPath(a);
          if (u !== void 0) {
            const d = { ...u };
            let c = d[t];
            if (c === void 0) {
              let w = e.nodeRegistry.get(o);
              if (
                (!w && a.length === 0 && (w = e.rootNode),
                w && w.additionalProperties)
              ) {
                const y =
                  typeof w.additionalProperties == "object"
                    ? w.additionalProperties
                    : { type: "string" };
                c = He(y);
              } else c = {};
            }
            (t && t in d && delete d[t],
              n && (d[n] = c),
              e.store.setPath(a, d),
              r.setAttribute("data-original-key", n));
            const g = `${o}.__ap_${s}`,
              h = e.elementIdToDataPath.get(o);
            if (!h) {
              console.warn(
                `[handleApKeyRename] Could not find parent data path for ID: ${o}`,
              );
              return;
            }
            const p = [...h, t],
              v = [...h, n];
            if (p) {
              ip(e, g, p, v);
              const w = r.closest(`.${D.triggers.additionalPropertyRow}`);
              if (w) {
                const y = w.querySelector(`.${D.triggers.apValueWrapper}`);
                y && op(y, p, v);
              }
            }
          }
        }
      }
    }
  }
  function Gd(e, r) {
    const t = yr(e, r.id);
    if (!t) return;
    if (r.value === "") {
      e.store.removePath(t);
      return;
    }
    let n = r.value;
    (r.type === "checkbox"
      ? (n = r.checked)
      : (r.type === "number" || r.type === "range") &&
        ((n = r.valueAsNumber), isNaN(n) && (n = null)),
      e.store.setPath(t, n));
  }
  function Yd(e, r) {
    r.addEventListener("change", (n) => {
      const i = n.target;
      i.classList.contains(D.triggers.oneOfSelector) && Jd(e, i, n);
    });
    const t = new Event("change", { bubbles: !0 });
    ((t.__isInit = !0),
      r.querySelectorAll(`.${D.triggers.oneOfSelector}`).forEach((n) => {
        const i = n,
          o = i.querySelector("option[selected]");
        (o && (i.value = o.value), n.dispatchEvent(t));
      }));
  }
  function Jd(e, r, t) {
    const n = r.getAttribute("data-id"),
      i = e.nodeRegistry.get(n),
      o = document.getElementById(`${n}__oneof_content`);
    if (i && i.oneOf && o) {
      const s = parseInt(r.value, 10);
      let a = i.oneOf[s];
      const u = a,
        d = n,
        c = e.elementIdToDataPath.get(n);
      if (!c) {
        console.warn(`[events] No data path found for element: ${n}`);
        return;
      }
      const g = yr(e, n);
      let h = {};
      if (
        (g && ((h = e.store.getPath(g) || {}), (a = gr(a, h))),
        (o.innerHTML = ""),
        o.appendChild(We(e, a, d, !0, c)),
        g)
      ) {
        let p = {};
        if (t.__isInit) {
          const w = He(u);
          typeof w == "object" && w !== null ? (p = { ...w, ...h }) : (p = h);
        } else {
          if (i.properties)
            for (const y in i.properties) h[y] !== void 0 && (p[y] = h[y]);
          const w = He(u);
          typeof w == "object" && w !== null && Object.assign(p, w);
        }
        e.store.setPath(g, p);
      }
      Ur(e);
    }
  }
  function Xd(e, r) {
    r.addEventListener("click", (t) => {
      const i = t.target.closest("button");
      i &&
        (i.classList.contains(D.triggers.addArrayItem)
          ? Qd(e, i)
          : i.classList.contains(D.triggers.removeArrayItem)
            ? Zd(e, i, r)
            : i.classList.contains(D.triggers.addAdditionalProperty)
              ? ep(e, i)
              : i.classList.contains(D.triggers.removeAdditionalProperty) &&
                rp(e, i, r));
    });
  }
  function Qd(e, r) {
    const t = r.getAttribute("data-id"),
      n = r.getAttribute("data-target"),
      i = e.nodeRegistry.get(t);
    if (i) {
      const o = document.getElementById(n);
      if (!o) return;
      const s = o.children.length;
      let a;
      if (
        (i.prefixItems && s < i.prefixItems.length
          ? (a = i.prefixItems[s])
          : i.items && (a = i.items),
        a)
      ) {
        const u = `Item ${s + 1}`;
        let d = { ...a, title: u },
          c = He(a);
        ((d = gr(d, c)), (d.key = String(s)));
        const g = e.elementIdToDataPath.get(t);
        if (!g) return;
        const h = [...g, s],
          p = We(e, d, t, !1, h),
          v = ne.renderArrayItem(p, { isRemovable: !0 });
        o.appendChild(v);
        const w = yr(e, t);
        if (w) {
          const _ = [...w, s];
          e.store.setPath(_, c);
        }
        const y = o.lastElementChild;
        (y &&
          y.querySelectorAll(`.${D.triggers.oneOfSelector}`).forEach((_) => {
            _.dispatchEvent(new Event("change", { bubbles: !0 }));
          }),
          o.dispatchEvent(new Event("change", { bubbles: !0 })),
          Ur(e));
      }
    }
  }
  function Zd(e, r, t) {
    const n = r.closest(`.${D.triggers.arrayItemRow}`),
      i = n?.parentElement;
    if (n && i) {
      const o = Array.from(i.children).indexOf(n),
        s = i.id && i.id.endsWith("-items") ? i.id.slice(0, -6) : "";
      n.remove();
      const a = yr(e, s);
      if (a) {
        const u = e.store.getPath(a);
        if (Array.isArray(u)) {
          const d = [...u.slice(0, o), ...u.slice(o + 1)];
          e.store.setPath(a, d);
        }
      }
      (s && tp(e, i, o, s),
        t.dispatchEvent(new Event("change", { bubbles: !0 })),
        Ur(e));
    }
  }
  function ep(e, r) {
    const t = r.getAttribute("data-id"),
      n = e.nodeRegistry.get(t),
      o = r
        .closest(`.${D.triggers.additionalPropertiesWrapper}`)
        ?.querySelector(`.${D.triggers.additionalPropertyItems}`);
    if (n && o) {
      const s = o.children.length,
        a =
          typeof n.additionalProperties == "object"
            ? n.additionalProperties
            : { type: "string", title: "Value" },
        u = { ...a, title: "Value", key: void 0 },
        d = `${t}.__ap_${s}`;
      let c = "";
      const g = pi(e, t || "");
      if (g?.getDefaultKey) c = g.getDefaultKey(s);
      else {
        const $ = r.getAttribute("data-key-pattern");
        $ && (c = $.replace("{i}", (s + 1).toString()));
      }
      const h = c || `__ap_${s}`,
        p = e.elementIdToDataPath.get(t);
      if (!p) return;
      const v = [...p, h],
        w = We(e, u, d, !0, v);
      (e.dataPathRegistry.set(Vr(v), d), e.elementIdToDataPath.set(d, v));
      const y = `${t}.__ap_${s}_key`,
        _ = g?.renderAdditionalPropertyRow
          ? g.renderAdditionalPropertyRow(w, c, y)
          : ne.renderAdditionalPropertyRow(w, c, y);
      if ((o.appendChild(_), c)) {
        const $ = yr(e, t);
        $ && e.store.setPath([...$, c], He(a));
      }
      const m = o.lastElementChild;
      if (m) {
        const $ = m.querySelector(`.${D.triggers.additionalPropertyKey}`);
        ($ && $.setAttribute("data-original-key", $.value),
          m.querySelectorAll(`.${D.triggers.oneOfSelector}`).forEach((P) => {
            P.dispatchEvent(new Event("change", { bubbles: !0 }));
          }));
      }
      o.dispatchEvent(new Event("change", { bubbles: !0 }));
    }
  }
  function rp(e, r, t) {
    const n = r.closest(`.${D.triggers.additionalPropertyRow}`),
      i = n?.querySelector(`.${D.triggers.additionalPropertyKey}`),
      s = r
        .closest(`.${D.triggers.additionalPropertiesWrapper}`)
        ?.getAttribute("data-element-id");
    if (i && i.value && s) {
      const d = yr(e, s);
      d && e.store.removePath([...d, i.value]);
    }
    const a = n?.parentElement,
      u = a ? Array.from(a.children).indexOf(n) : -1;
    (n?.remove(),
      a && u !== -1 && s && np(e, a, u, s),
      t.dispatchEvent(new Event("change", { bubbles: !0 })));
  }
  function yr(e, r) {
    const t = e.elementIdToDataPath.get(r);
    return t ? (t.length <= 1 ? [] : t.slice(1)) : null;
  }
  function tp(e, r, t, n) {
    const i = Array.from(r.children);
    for (let o = t; o < i.length; o++) {
      const s = i[o],
        a = o + 1,
        u = o,
        d = `${n}.${a}`,
        c = `${n}.${u}`,
        g = s.querySelector(`.${D.triggers.arrayItemContent}`);
      if (g && g.firstElementChild) {
        const p = g.firstElementChild,
          v = p.querySelector("legend");
        v &&
          /^Item \d+$/.test(v.textContent || "") &&
          (v.textContent = `Item ${u + 1}`);
        const w = p.querySelector("label");
        if (w) {
          for (const y of Array.from(w.childNodes))
            if (
              y.nodeType === Node.TEXT_NODE &&
              /^Item \d+$/.test(y.textContent?.trim() || "")
            ) {
              y.textContent = `Item ${u + 1}`;
              break;
            }
        }
      }
      ([s, ...s.querySelectorAll("*")].forEach((p) => {
        (p.id && p.id.startsWith(d) && (p.id = p.id.replace(d, c)),
          [
            "name",
            "for",
            "data-target",
            "data-id",
            "data-toggle-target",
          ].forEach((v) => {
            if (p.hasAttribute(v)) {
              const w = p.getAttribute(v);
              w.startsWith(d) && p.setAttribute(v, w.replace(d, c));
            }
          }));
      }),
        Ua(e, d, c, a, u));
    }
  }
  function np(e, r, t, n) {
    const i = Array.from(r.children);
    for (let o = t; o < i.length; o++) {
      const s = i[o],
        a = s.querySelector(`.${D.triggers.additionalPropertyKey}`);
      if (a && a.id) {
        const u = a.id.match(/__ap_(\d+)_key$/);
        if (u) {
          const d = parseInt(u[1], 10),
            c = o;
          if (d !== c) {
            const g = `${n}.__ap_${d}`,
              h = `${n}.__ap_${c}`;
            ([s, ...s.querySelectorAll("*")].forEach((v) => {
              (v.id && v.id.startsWith(g) && (v.id = v.id.replace(g, h)),
                [
                  "name",
                  "for",
                  "data-target",
                  "data-id",
                  "data-toggle-target",
                ].forEach((w) => {
                  v.hasAttribute(w) &&
                    v.getAttribute(w).startsWith(g) &&
                    v.setAttribute(w, v.getAttribute(w).replace(g, h));
                }));
            }),
              Ua(e, g, h, `__ap_${d}`, `__ap_${c}`));
          }
        }
      }
    }
  }
  function ip(e, r, t, n) {
    const i = [];
    for (const o of e.elementIdToDataPath.keys())
      (o === r || o.startsWith(r + ".")) && i.push(o);
    for (const o of i) {
      const s = e.elementIdToDataPath.get(o);
      if (
        s.length >= t.length &&
        s.slice(0, t.length).every((a, u) => a === t[u])
      ) {
        const a = s.slice(t.length),
          u = [...n, ...a];
        (e.elementIdToDataPath.set(o, u),
          e.dataPathRegistry.delete(Vr(s)),
          e.dataPathRegistry.set(Vr(u), o));
      }
    }
  }
  function op(e, r, t) {
    const n = Ar(r),
      i = Ar(t);
    e.querySelectorAll("[name]").forEach((s) => {
      const a = s.getAttribute("name");
      if (a && a.startsWith(n)) {
        const u = a[n.length];
        (!u || u === "[") && s.setAttribute("name", i + a.substring(n.length));
      }
    });
  }
  function Ua(e, r, t, n, i) {
    const o = [];
    for (const u of e.nodeRegistry.keys())
      (u === r || u.startsWith(r + ".")) && o.push(u);
    const s = e.elementIdToDataPath.get(r);
    let a;
    s && s[s.length - 1] === n && (a = [...s.slice(0, -1), i]);
    for (const u of o) {
      const d = u.replace(r, t),
        c = e.nodeRegistry.get(u);
      c && (e.nodeRegistry.set(d, c), e.nodeRegistry.delete(u));
      const g = e.elementIdToDataPath.get(u);
      if (g) {
        let h = [...g];
        (s &&
        a &&
        g.length >= s.length &&
        g.slice(0, s.length).every((p, v) => p === s[v])
          ? (h = [...a, ...g.slice(s.length)])
          : g[g.length - 1] === n && (h = [...g.slice(0, -1), i]),
          e.elementIdToDataPath.set(d, h),
          e.elementIdToDataPath.delete(u),
          e.dataPathRegistry.delete(Vr(g)),
          e.dataPathRegistry.set(Vr(h), d));
      }
    }
  }
  function Va(e, r) {
    const t = e.rootNode,
      n = t.title.replace(/[^a-zA-Z0-9]/g, ""),
      s =
        "/" +
        (t.key || n || "root").replace(/~/g, "~0").replace(/\//g, "~1") +
        r;
    if (e.dataPathRegistry.has(s)) return e.dataPathRegistry.get(s);
    const a = s.split("/").filter((u) => u);
    for (const [u, d] of e.dataPathRegistry.entries()) {
      const c = u.split("/").filter((h) => h);
      if (c.length !== a.length) continue;
      let g = !0;
      for (let h = 0; h < c.length; h++) {
        const p = c[h],
          v = a[h];
        if (p !== v) {
          if (p.startsWith("__ap_")) {
            const w = "/" + c.slice(0, h + 1).join("/"),
              y = e.dataPathRegistry.get(w);
            if (y) {
              const m = `${y.substring(0, y.lastIndexOf("."))}_key`,
                $ = document.getElementById(m),
                P = v.replace(/~1/g, "/").replace(/~0/g, "~");
              if ($ && $.value === P) continue;
            }
          }
          g = !1;
          break;
        }
      }
      if (g) return d;
    }
  }
  function Ur(e) {
    if (!e.rootNode) return null;
    const r = e.store.get(),
      t = Ld(r),
      n = new Set(),
      i = document.getElementById("generated-form");
    i &&
      (i.querySelectorAll("[data-validation-for]").forEach((a) => {
        a.innerHTML = "";
      }),
      i
        .querySelectorAll(`.${D.classes.invalid}`)
        .forEach((a) => a.classList.remove(D.classes.invalid)));
    const o = document.getElementById("form-global-errors");
    o && ((o.innerHTML = ""), (o.className = ""));
    let s = null;
    if (t) {
      const a = new Map();
      (t.forEach((d) => {
        const c = d.instancePath;
        (a.has(c) || a.set(c, []), a.get(c).push(d));
      }),
        (s = []),
        a.forEach((d) => {
          const c = d.find(
            (g) => g.keyword === "oneOf" || g.keyword === "anyOf",
          );
          c
            ? ((c.message = "A valid selection is required"),
              s.push(c),
              d.forEach((g) => {
                if (
                  g !== c &&
                  g.keyword === "required" &&
                  g.params.missingProperty
                ) {
                  const h = g.instancePath
                      ? `${g.instancePath}/${g.params.missingProperty}`
                      : `/${g.params.missingProperty}`,
                    p = Va(e, h);
                  p &&
                    (document.getElementById(p) ||
                      document.querySelector(`[data-element-id="${p}"]`)) &&
                    s.push(g);
                }
              }))
            : s.push(...d);
        }),
        s.forEach((d) => {
          let c = d.instancePath;
          d.keyword === "required" &&
            d.params.missingProperty &&
            (c = c
              ? `${c}/${d.params.missingProperty}`
              : `/${d.params.missingProperty}`);
          const g = Va(e, c);
          if (g) {
            const h =
                document.getElementById(g) ||
                document.querySelector(`[data-element-id="${g}"]`),
              p = document.querySelector(`[data-validation-for="${g}"]`);
            if ((h && h.classList.add(D.classes.invalid), p)) {
              const v = document.createElement("div");
              ((v.className = `${D.classes.error} ${D.triggers.validationError}`),
                d.keyword === "required"
                  ? (v.textContent = "This field is required")
                  : (v.textContent = d.message || "Invalid value"),
                p.appendChild(v),
                n.add(d));
            }
          }
        }));
      const u = s.filter((d) => !n.has(d));
      if (o && u.length > 0) {
        o.className = `${D.classes.alertDanger} mb-3`;
        const d = K("ul", { className: "mb-0 ps-3" });
        (u.forEach((c) => {
          const g = `${c.instancePath || "Schema"}: ${c.message}`;
          d.appendChild(K("li", {}, g));
        }),
          o.appendChild(d));
      }
    }
    return s;
  }
  const sp = {
    mode: { widget: "select", options: ["consumer", "subscriber"] },
  };
  function za(e, r) {
    const t = We(r, r.rootNode, "", !1, []),
      n = ne.renderFormWrapper(t);
    ((e.innerHTML = ""), e.appendChild(n), zd(r, n));
  }
  function pi(e, r) {
    const t = r.toLowerCase();
    let n = -1,
      i;
    for (const o in e.customRenderers) {
      const s = o.toLowerCase();
      (t === s || t.endsWith("." + s)) &&
        s.length > n &&
        ((i = e.customRenderers[o]), (n = s.length));
    }
    return i;
  }
  function Ar(e) {
    if (!e || e.length === 0) return "";
    const r = or.html?.skipRootFromName && e.length > 1 ? e.slice(1) : e;
    if (r.length === 0) return "";
    const [t, ...n] = r;
    return t + n.map((i) => `[${i}]`).join("");
  }
  function Vr(e) {
    return (
      "/" +
      e.map((r) => String(r).replace(/~/g, "~0").replace(/\//g, "~1")).join("/")
    );
  }
  function We(e, r, t, n = !1, i = []) {
    let o = r.key;
    if (!o) {
      let d = r.title.replace(/[^a-zA-Z0-9]/g, "");
      (!d &&
        r.title &&
        (d = Array.from(r.title)
          .map((c) => c.charCodeAt(0).toString(16))
          .join("")),
        (o = t ? `__var_${d || "untitled"}` : d || "root"));
    }
    const s = t ? `${t}.${o}` : o;
    !t && i.length === 0 && (i = [o]);
    const a = Ar(i);
    if (
      e.config.visibility.customVisibility &&
      !e.config.visibility.customVisibility(r, s)
    )
      return ne.renderFragment([]);
    if (
      e.config.visibility.hiddenPaths.includes(s) ||
      e.config.visibility.hiddenKeys.includes(r.title)
    )
      return ne.renderFragment([]);
    (e.nodeRegistry.set(s, r),
      n || e.dataPathRegistry.set(Vr(i), s),
      e.elementIdToDataPath.set(s, i));
    const u = pi(e, s);
    if (u?.render) return u.render(r, t, s, i, e);
    if (u?.widget === "select")
      return ne.renderSelect(r, s, u.options || [], a);
    if (r.enum) return ne.renderSelect(r, s, r.enum.map(String), a);
    switch (r.type) {
      case "string":
        return ne.renderString(r, s, a);
      case "number":
      case "integer": {
        const d = r.defaultValue === null ? { ...r, defaultValue: "" } : r;
        return ne.renderNumber(d, s, a);
      }
      case "boolean":
        return ne.renderBoolean(r, s, a);
      case "object":
        return hi(e, r, s, n, i);
      case "array": {
        const d = !!(r.prefixItems && r.prefixItems.length > 0 && !r.items),
          c = ne.renderArray(r, s, { isFixedSize: d }),
          g = c.querySelector(`.${D.triggers.arrayItems}`);
        if (
          (r.prefixItems &&
            r.prefixItems.length > 0 &&
            g &&
            r.prefixItems.forEach((h, p) => {
              let v,
                w = !1;
              if (
                (Array.isArray(r.defaultValue) &&
                  r.defaultValue.length > p &&
                  ((v = r.defaultValue[p]), (w = !0)),
                w)
              ) {
                const y = gr(h, v);
                y.key = String(p);
                const _ = [...i, p],
                  m = We(e, y, s, !1, _);
                g.appendChild(ne.renderArrayItem(m, { isRemovable: !1 }));
              }
            }),
          Array.isArray(r.defaultValue) && r.items && g)
        ) {
          const h = r.prefixItems ? r.prefixItems.length : 0;
          r.defaultValue.slice(h).forEach((p, v) => {
            const w = h + v,
              y = gr(r.items, p);
            ((y.title = y.title || `Item ${w + 1}`), (y.key = String(w)));
            const _ = [...i, w],
              m = We(e, y, s, !1, _);
            g.appendChild(ne.renderArrayItem(m, { isRemovable: !0 }));
          });
        }
        return c;
      }
      case "null":
        return ne.renderNull(r);
      default:
        return ne.renderUnsupported(r);
    }
  }
  function hi(e, r, t, n, i, o) {
    const s = Ar(i),
      a = ne.renderOneOf(r, t, s),
      u = r.properties ? tt(e, r.properties, t, i) : ne.renderFragment([]),
      d = ne.renderAdditionalProperties(r, t, o?.additionalProperties);
    if (
      r.additionalProperties &&
      r.defaultValue &&
      typeof r.defaultValue == "object"
    ) {
      const g = d.querySelector(`.${D.triggers.additionalPropertyItems}`);
      if (g) {
        const h = new Set(r.properties ? Object.keys(r.properties) : []);
        let p = 0;
        Object.keys(r.defaultValue).forEach((v) => {
          if (h.has(v)) return;
          const w =
              typeof r.additionalProperties == "object"
                ? r.additionalProperties
                : { type: "string", title: "" },
            y = gr(w, r.defaultValue[v]);
          ((y.title = v), (y.key = v));
          const _ = [...i, v],
            m = `${t}.__ap_${p}`,
            $ = We(e, y, m, !0, _),
            P = `${m}_key`,
            b = pi(e, t),
            A = b?.renderAdditionalPropertyRow
              ? b.renderAdditionalPropertyRow($, v, P)
              : ne.renderAdditionalPropertyRow($, v, P);
          (g.appendChild(A), p++);
        });
      }
    }
    const c = ne.renderFragment([a, u, d]);
    return n ? ne.renderHeadlessObject(t, c) : ne.renderObject(r, t, c);
  }
  function tt(e, r, t, n = []) {
    const i = e.config.layout.groups[t] || [],
      o = new Set(i.flatMap((c) => c.keys)),
      s = ne.renderFragment(
        i.map((c) => {
          const g = ne.renderFragment(
            c.keys.map((h) =>
              r[h] ? We(e, r[h], t, !1, [...n, h]) : ne.renderFragment([]),
            ),
          );
          return ne.renderLayoutGroup(c.title, g, c.className);
        }),
      ),
      u = Object.keys(r)
        .filter((c) => !o.has(c))
        .sort((c, g) => {
          const h = r[c],
            p = r[g],
            v = e.config.sorting.defaultRenderLast || [],
            w = v.includes(c.toLowerCase()),
            y = v.includes(g.toLowerCase());
          if (w !== y) return w ? 1 : -1;
          const _ =
              e.config.sorting.perObjectPriority[t] ||
              e.config.sorting.defaultPriority,
            m = _.indexOf(c.toLowerCase()),
            $ = _.indexOf(g.toLowerCase());
          if (m !== -1 && $ !== -1) return m - $;
          if (m !== -1) return -1;
          if ($ !== -1) return 1;
          const P = ["string", "number", "integer", "boolean"].includes(h.type),
            b = ["string", "number", "integer", "boolean"].includes(p.type);
          return P !== b ? (P ? -1 : 1) : c.localeCompare(g);
        }),
      d = ne.renderFragment(u.map((c) => We(e, r[c], t, !1, [...n, c])));
    return ne.renderFragment([s, d]);
  }
  function gr(e, r) {
    if (r === void 0) return e;
    const t = { ...e };
    if (t.type === "object" && typeof r == "object" && r !== null) {
      if (((t.defaultValue = r), t.properties)) {
        t.properties = { ...t.properties };
        for (const n in t.properties)
          t.properties[n] = gr(t.properties[n], r[n]);
      }
    } else if (["string", "number", "integer", "boolean"].includes(t.type)) {
      let n = !0;
      (t.enum && t.enum.length > 0 && (t.enum.includes(r) || (n = !1)),
        n && (t.defaultValue = r));
    } else t.type === "array" && Array.isArray(r) && (t.defaultValue = r);
    return t;
  }
  const ap = ({ buttonLabel: e = "Add Item", itemLabel: r = "Item" } = {}) => ({
      render: (t, n, i, o, s) => {
        const a = `${i}-items`,
          u = K("div", { className: D.classes.arrayItems, id: a }),
          d = (p, v) => {
            let w = t.items.oneOf ? t.items.oneOf[0] : t.items;
            if (p && typeof p == "object" && t.items.oneOf) {
              const P = Object.keys(p);
              t.items.oneOf.forEach((b) => {
                if (b.properties) {
                  const A = Object.keys(b.properties);
                  A.length === 1 && P.includes(A[0]) && (w = b);
                }
              });
            }
            let y = w,
              _ = `${n}.${v}`,
              m = [...o, v];
            if (w.properties && Object.keys(w.properties).length === 1) {
              const P = Object.keys(w.properties)[0];
              ((y = w.properties[P]),
                (_ = `${_}.${P}`),
                (m = [...m, P]),
                y.title ||
                  (y = {
                    ...y,
                    title: w.title || P.charAt(0).toUpperCase() + P.slice(1),
                  }));
            } else y = { ...w, title: w.title || `${r} ${v + 1}` };
            const $ = We(s, y, _, !1, m);
            return ne.renderArrayItem($);
          };
        Array.isArray(t.defaultValue) &&
          t.defaultValue.forEach((p, v) => {
            u.appendChild(d(p, v));
          });
        const c = K(
          "button",
          {
            type: "button",
            className: D.classes.buttonPrimary,
            onclick: (p) => {
              p.currentTarget.style.display = "none";
              const v = p.currentTarget.nextElementSibling;
              ((v.style.display = "inline-block"),
                v.focus(),
                v.showPicker && v.showPicker());
            },
          },
          e,
        );
        if (!t.items.oneOf)
          return K(
            "fieldset",
            { className: D.classes.fieldset, id: i },
            K("legend", { className: D.classes.legend }, t.title),
            t.description
              ? K("div", { className: D.classes.description }, t.description)
              : "",
            u,
          );
        const g = t.items.oneOf
          .map((p, v) =>
            p.type === "null" || (p.title && p.title.toLowerCase() === "null")
              ? null
              : K("option", { value: v }, p.title || `Option ${v + 1}`),
          )
          .filter((p) => p !== null);
        g.unshift(
          K(
            "option",
            { value: "", selected: !0, disabled: !0 },
            "Select type...",
          ),
        );
        const h = K(
          "select",
          {
            className: D.classes.select,
            style: "display: none; width: auto; margin-top: 0.5rem;",
            onchange: (p) => {
              const v = parseInt(p.target.value, 10);
              if (isNaN(v)) return;
              ((p.target.value = ""),
                (p.target.style.display = "none"),
                (c.style.display = "inline-block"));
              const w = s.elementIdToDataPath.get(i);
              if (!w) return;
              const y = w.length > 1 ? w.slice(1) : [],
                m = (s.store.getPath(y) || []).length,
                $ = t.items.oneOf[v],
                P = He($);
              s.store.setPath([...y, m], P);
              const b = d(P, m);
              u.appendChild(b);
            },
            onblur: (p) => {
              ((p.target.value = ""),
                (p.target.style.display = "none"),
                (c.style.display = "inline-block"));
            },
          },
          ...g,
        );
        return K(
          "fieldset",
          { className: D.classes.fieldset, id: i },
          K("legend", { className: D.classes.legend }, t.title),
          t.description
            ? K("div", { className: D.classes.description }, t.description)
            : "",
          u,
          c,
          h,
        );
      },
    }),
    cp = (e = []) => ({
      render: (r, t, n, i, o) => {
        if (r.type !== "object") {
          const h = Ar(i);
          if (r.type === "string") return ne.renderString(r, n, h);
          if (r.type === "boolean") return ne.renderBoolean(r, n, h);
          if (r.type === "number" || r.type === "integer") {
            const p = r.defaultValue === null ? { ...r, defaultValue: "" } : r;
            return ne.renderNumber(p, n, h);
          }
          return ne.renderUnsupported(r);
        }
        const s = {},
          a = {},
          u = new Set(e);
        r.properties &&
          Object.keys(r.properties).forEach((h) => {
            const p = r.properties[h];
            p.required || u.has(h) ? (s[h] = p) : (a[h] = p);
          });
        const d = tt(o, s, n, i);
        let c = null,
          g = null;
        if (Object.keys(a).length > 0) {
          const h = `${n}-options`;
          ((c = K(
            "div",
            { id: h, style: "display: none;", className: "" },
            tt(o, a, n, i),
          )),
            (g = K(
              "button",
              {
                type: "button",
                className: "btn btn-sm btn-link p-0 text-decoration-none mt-2",
                onclick: (p) => {
                  const v = p.currentTarget,
                    w = document.getElementById(h);
                  if (w) {
                    const y = w.style.display === "none";
                    ((w.style.display = y ? "block" : "none"),
                      (v.textContent = y ? "Hide" : "Show more..."));
                  }
                },
              },
              "Show more...",
            )));
        }
        return K(
          "fieldset",
          {
            className: `${D.classes.fieldset} ${D.classes.objectWrapper}`,
            id: n,
          },
          K("legend", { className: D.classes.legend }, r.title),
          r.description
            ? K("div", { className: `${D.classes.description}` }, r.description)
            : "",
          d,
          g || "",
          c || "",
        );
      },
    }),
    lp = (e = "required") => ({
      render: (r, t, n, i, o) => {
        const s = r.properties?.[e];
        if (!s) return hi(o, r, n, !1, i);
        const a = { ...r.properties };
        delete a[e];
        const u = [...i, e],
          d = Ar(u),
          c = `${n}.${e}`,
          g = `${n}-options`,
          h = ne.renderBoolean(s, c, d, `data-toggle-target="${g}"`),
          p = tt(o, a, n, i);
        return K(
          "fieldset",
          {
            className: `${D.classes.fieldset} ${D.classes.objectWrapper}`,
            id: n,
          },
          K("legend", { className: D.classes.legend }, r.title),
          h,
          K("div", { id: g, style: "display: none;", className: "mt-3" }, p),
        );
      },
    });
  class up {
    state;
    listeners = new Set();
    constructor(r) {
      this.state = r;
    }
    get() {
      return this.state;
    }
    getPath(r) {
      let t = this.state;
      for (const n of r) {
        if (t == null) return;
        t = t[n];
      }
      return t;
    }
    set(r) {
      ((this.state = r), this.notify());
    }
    reset(r) {
      ((this.state = r), this.notify());
    }
    setPath(r, t) {
      if (r.length === 0) {
        this.set(t);
        return;
      }
      let n = structuredClone(this.state);
      n == null && (n = typeof r[0] == "number" ? [] : {});
      let i = n;
      for (let o = 0; o < r.length - 1; o++) {
        const s = r[o];
        if (i[s] === void 0 || i[s] === null) {
          const a = r[o + 1];
          i[s] = typeof a == "number" ? [] : {};
        }
        i = i[s];
      }
      ((i[r[r.length - 1]] = t), (this.state = n), this.notify());
    }
    removePath(r) {
      if (r.length === 0) return;
      const t = structuredClone(this.state);
      if (t == null) return;
      let n = t;
      for (let o = 0; o < r.length - 1; o++)
        if (((n = n[r[o]]), n == null)) return;
      const i = r[r.length - 1];
      (Array.isArray(n) && typeof i == "number" ? n.splice(i, 1) : delete n[i],
        (this.state = t),
        this.notify());
    }
    subscribe(r) {
      return (
        this.listeners.add(r),
        () => {
          this.listeners.delete(r);
        }
      );
    }
    notify() {
      for (const r of this.listeners)
        try {
          r(this.state);
        } catch (t) {
          console.error("[Store] Listener error:", t);
        }
    }
  }
  function fp(e, r) {
    const t = [],
      n = [],
      i = (o) => {
        const s = [];
        if (o.type === "Control" && o.scope) {
          const a = o.scope.split("/").pop();
          a && (n.push(a), s.push(a));
        } else if (o.type === "HorizontalLayout" && o.elements) {
          const a = [];
          (o.elements.forEach((u) => {
            a.push(...i(u));
          }),
            a.length && t.push({ keys: a, className: "d-flex gap-3" }),
            s.push(...a));
        } else if (o.type === "Group" && o.elements) {
          const a = [];
          (o.elements.forEach((u) => {
            a.push(...i(u));
          }),
            a.length && t.push({ keys: a, title: o.label }),
            s.push(...a));
        } else
          o.type === "VerticalLayout" &&
            o.elements &&
            o.elements.forEach((a) => {
              s.push(...i(a));
            });
        return s;
      };
    (i(e),
      rs({
        layout: { groups: { ...or.layout.groups, [r]: t } },
        sorting: {
          perObjectPriority: { ...or.sorting.perObjectPriority, [r]: n },
        },
      }));
  }
  let mi = {};
  function dp(e) {
    mi = { ...mi, ...e };
  }
  async function Ka(e, r, t, n, i) {
    let o, s;
    typeof t == "function" ? (s = t) : ((o = t), (s = n));
    const a = typeof e == "string" ? document.getElementById(e) : e;
    if (!a) {
      console.error(
        `Required DOM element ${typeof e == "string" ? "#" + e : ""} not found.`,
      );
      return;
    }
    try {
      let u = r,
        d = o;
      if (i?.subSchemaPath) {
        let w = typeof u == "string" ? await (await fetch(u)).json() : u;
        const y = i.subSchemaPath.split(".");
        let _ = w,
          m = d;
        for (const $ of y)
          if (_ && _.properties && _.properties[$])
            ((_ = _.properties[$]),
              m && typeof m == "object" && m !== null && m[$] !== void 0
                ? (m = m[$])
                : (m = void 0));
          else {
            _ = void 0;
            break;
          }
        if (_) ((u = _), (d = m));
        else {
          const $ = `Error: sub-schema path "${i.subSchemaPath}" not found.`;
          (console.error($),
            (a.innerHTML = ""),
            a.appendChild(ne.renderSchemaError(new Error($))));
          return;
        }
      }
      let c = await Bd(u);
      const g = d !== void 0 ? d : He(c);
      g !== void 0 && (c = gr(c, g));
      const h = new up({}),
        p = {
          store: h,
          rootNode: c,
          config: or,
          nodeRegistry: new Map(),
          dataPathRegistry: new Map(),
          elementIdToDataPath: new Map(),
          customRenderers: { ...sp, ...mi },
        };
      return (
        h.reset(g),
        za(a, p),
        h.subscribe((w) => {
          s && s(w);
        }),
        typeof s == "function" && g !== void 0 && s(g),
        {
          rootNode: c,
          getData: () => h.get(),
          setData: (w) => {
            ((p.rootNode = gr(c, w)), za(a, p), h.reset(w));
          },
          validate: async () => Ur(p),
        }
      );
    } catch (u) {
      throw (
        (a.innerHTML = ""),
        a.appendChild(ne.renderSchemaError(u)),
        console.error(u),
        u
      );
    }
  }
  async function pp(e, r, t) {
    const n = document.getElementById(t);
    return Ka(e, r, void 0, (i) => {
      if (n) {
        const o = JSON.stringify(i, null, 2);
        n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement
          ? (n.value = o)
          : ((n.textContent = o), (n.style.whiteSpace = "pre"));
      }
    });
  }
  const hp = Object.freeze(
    Object.defineProperty(
      { __proto__: null, default: {} },
      Symbol.toStringTag,
      { value: "Module" },
    ),
  );
  ((de.adaptUiSchema = fp),
    (de.createAdvancedOptionsRenderer = cp),
    (de.createOptionalRenderer = lp),
    (de.createTypeSelectArrayRenderer = ap),
    (de.domRenderer = ne),
    (de.generateDefaultData = He),
    (de.getName = Ar),
    (de.h = K),
    (de.init = Ka),
    (de.initLinked = pp),
    (de.renderCompactFieldWrapper = Vd),
    (de.renderNode = We),
    (de.renderObject = hi),
    (de.renderProperties = tt),
    (de.rendererConfig = D),
    (de.resetConfig = bf),
    (de.resetI18n = $f),
    (de.resolvePath = yr),
    (de.setConfig = rs),
    (de.setCustomRenderers = dp),
    (de.setI18n = _f),
    (de.validateAndShowErrors = Ur),
    Object.defineProperty(de, Symbol.toStringTag, { value: "Module" }));
});
//# sourceMappingURL=vanilla-schema-forms.umd.js.map
