package patterns.creational.factoryMethod;

import patterns.creational.factoryMethod.ingredients.DevType;
import patterns.creational.factoryMethod.ingredients.DeveloperFactory;

public class ApplyPattern {
    public static void main(String[] args) {
        var dev1 = DeveloperFactory.getDeveloper(DevType.BACK_END);
        System.out.println(dev1.getProgrammingLanguage());
        var dev2 = DeveloperFactory.getDeveloper(DevType.FRONT_END);
        System.out.println(dev2.getProgrammingLanguage());
    }
}
