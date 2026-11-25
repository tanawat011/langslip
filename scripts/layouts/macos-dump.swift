import Carbon
import Foundation

// US ANSI virtual key codes -> (unshifted, shifted) US characters
let keys: [(UInt16, String, String)] = [
 (50,"`","~"),(18,"1","!"),(19,"2","@"),(20,"3","#"),(21,"4","$"),(23,"5","%"),(22,"6","^"),(26,"7","&"),(28,"8","*"),(25,"9","("),(29,"0",")"),(27,"-","_"),(24,"=","+"),
 (12,"q","Q"),(13,"w","W"),(14,"e","E"),(15,"r","R"),(17,"t","T"),(16,"y","Y"),(32,"u","U"),(34,"i","I"),(31,"o","O"),(35,"p","P"),(33,"[","{"),(30,"]","}"),(42,"\\","|"),
 (0,"a","A"),(1,"s","S"),(2,"d","D"),(3,"f","F"),(5,"g","G"),(4,"h","H"),(38,"j","J"),(40,"k","K"),(37,"l","L"),(41,";",":"),(39,"'","\""),
 (6,"z","Z"),(7,"x","X"),(8,"c","C"),(9,"v","V"),(11,"b","B"),(45,"n","N"),(46,"m","M"),(43,",","<"),(47,".",">"),(44,"/","?"),
]

func translate(_ layout: UnsafePointer<UCKeyboardLayout>, _ code: UInt16, _ mods: UInt32) -> String {
  var dead: UInt32 = 0
  var len = 0
  var chars = [UniChar](repeating: 0, count: 8)
  let st = UCKeyTranslate(layout, code, UInt16(kUCKeyActionDown), (mods >> 8) & 0xFF, UInt32(LMGetKbdType()), OptionBits(kUCKeyTranslateNoDeadKeysBit), &dead, 8, &len, &chars)
  if st != noErr { return "<err>" }
  if len == 0 && dead != 0 { return "<dead>" }
  return String(utf16CodeUnits: chars, count: len)
}

let ids = CommandLine.arguments.dropFirst()
let filter = [kTISPropertyInputSourceCategory as String: kTISCategoryKeyboardInputSource as String] as CFDictionary
let list = TISCreateInputSourceList(filter, true).takeRetainedValue() as! [TISInputSource]
for id in ids {
  guard let src = list.first(where: { s in
    let p = TISGetInputSourceProperty(s, kTISPropertyInputSourceID)
    return p != nil && (Unmanaged<CFString>.fromOpaque(p!).takeUnretainedValue() as String) == id
  }) else { print("NOTFOUND \(id)"); continue }
  guard let dp = TISGetInputSourceProperty(src, kTISPropertyUnicodeKeyLayoutData) else { print("NODATA \(id)"); continue }
  let data = Unmanaged<CFData>.fromOpaque(dp).takeUnretainedValue() as Data
  data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
    let layout = raw.baseAddress!.assumingMemoryBound(to: UCKeyboardLayout.self)
    var rows: [String] = []
    for (code, u, s) in keys {
      let base = translate(layout, code, 0)
      let lsh = translate(layout, code, UInt32(shiftKey))
      let rsh = translate(layout, code, UInt32(rightShiftKey))
      rows.append("\(u)\t\(base)\t\(s)\t\(lsh)\t\(rsh)")
    }
    print("== \(id)")
    print(rows.joined(separator: "\n"))
  }
}
